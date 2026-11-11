use std::{
    cell::RefCell,
    path::PathBuf,
    time::{Duration, Instant},
};

use objc2::{
    define_class, msg_send, rc::Retained, runtime::ProtocolObject, AnyThread, DefinedClass,
    MainThreadMarker, MainThreadOnly,
};
use objc2_app_kit::{
    NSDragOperation, NSDraggingContext, NSDraggingItem, NSDraggingSession, NSDraggingSource,
    NSEvent, NSEventType, NSView, NSWorkspace,
};
use objc2_foundation::{
    NSArray, NSObject, NSObjectProtocol, NSPoint, NSProcessInfo, NSRect, NSSize, NSString, NSURL,
};

struct DragData {
    origin: RefCell<DragOrigin>,
    complete: RefCell<Option<Box<dyn FnOnce(bool)>>>,
}

struct DragOrigin {
    paths: Vec<String>,
    source_paths: Vec<String>,
    worktree_id: String,
    active: bool,
    context: NSDraggingContext,
    finished: Option<Instant>,
    consumed: bool,
}

impl DragOrigin {
    fn finish(&mut self, accepted: bool) {
        self.active = false;
        self.finished =
            (accepted && self.context == NSDraggingContext::WithinApplication).then(Instant::now);
    }

    fn take(&mut self, paths: &[PathBuf]) -> Option<(String, Vec<String>)> {
        // Wry queues Drop onto Tauri's event loop; AppKit can call ended first.
        let queued = self
            .finished
            .is_some_and(|time| time.elapsed() < Duration::from_secs(2));
        if self.consumed
            || (!self.active && !queued)
            || paths.len() != self.paths.len()
            || !paths
                .iter()
                .all(|path| self.paths.iter().any(|value| path == &PathBuf::from(value)))
        {
            return None;
        }
        self.consumed = true;
        Some((self.worktree_id.clone(), self.source_paths.clone()))
    }
}

define_class!(
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = DragData]
    struct FileDragSource;

    unsafe impl NSObjectProtocol for FileDragSource {}

    unsafe impl NSDraggingSource for FileDragSource {
        #[unsafe(method(draggingSession:sourceOperationMaskForDraggingContext:))]
        fn operations(
            &self,
            _session: &NSDraggingSession,
            context: NSDraggingContext,
        ) -> NSDragOperation {
            self.ivars().origin.borrow_mut().context = context;
            // Finder owns the copy. Never let an external target delete our source files.
            // Wry also accepts Copy for internal drops; the explorer routes those to its move operation.
            NSDragOperation::Copy
        }

        #[unsafe(method(draggingSession:endedAtPoint:operation:))]
        fn ended(&self, _session: &NSDraggingSession, _point: NSPoint, operation: NSDragOperation) {
            self.ivars()
                .origin
                .borrow_mut()
                .finish(operation != NSDragOperation::None);
            let complete = self.ivars().complete.borrow_mut().take();
            if let Some(complete) = complete {
                complete(operation != NSDragOperation::None);
            }
        }
    }
);

thread_local! {
    // AppKit does not retain the source. Keep at most one delegate, including
    // through its completion callback; the next gesture replaces the finished one.
    static SOURCE: RefCell<Option<Retained<FileDragSource>>> = const { RefCell::new(None) };
}

pub fn origin_for(paths: &[PathBuf]) -> Option<(String, Vec<String>)> {
    SOURCE.with(|slot| {
        let source = slot.borrow();
        let result = source.as_ref()?.ivars().origin.borrow_mut().take(paths);
        result
    })
}

pub fn begin(
    view: &NSView,
    paths: Vec<String>,
    source_paths: Vec<String>,
    worktree_id: String,
    complete: Box<dyn FnOnce(bool)>,
    mtm: MainThreadMarker,
) -> Result<(), String> {
    if SOURCE.with(|slot| {
        slot.borrow()
            .as_ref()
            .is_some_and(|source| source.ivars().complete.borrow().is_some())
    }) {
        return Err("A file drag is already active".into());
    }
    if NSEvent::pressedMouseButtons() & 1 == 0 {
        complete(false);
        return Ok(());
    }
    let window = view.window().ok_or("File drag window unavailable")?;
    let location = window.convertPointFromScreen(NSEvent::mouseLocation());
    // IPC may run between native mouse events. Use the still-held mouse's
    // current position rather than a stale NSApplication.currentEvent.
    let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        NSEventType::LeftMouseDragged,
        location,
        NSEvent::modifierFlags_class(),
        NSProcessInfo::processInfo().systemUptime(),
        window.windowNumber(),
        None, 0, 1, 1.0,
    ).ok_or("File drag mouse event unavailable")?;
    let point = view.convertPoint_fromView(location, None);
    let workspace = NSWorkspace::sharedWorkspace();
    let mut items = Vec::with_capacity(paths.len());
    for (index, path) in paths.iter().enumerate() {
        let path = NSString::from_str(path);
        let url = NSURL::fileURLWithPath(&path);
        let item = NSDraggingItem::initWithPasteboardWriter(
            NSDraggingItem::alloc(),
            ProtocolObject::from_ref(&*url),
        );
        let image = workspace.iconForFile(&path);
        let offset = (index.min(4) as f64) * 4.0;
        let frame = NSRect::new(
            NSPoint::new(point.x + offset, point.y - 32.0 - offset),
            NSSize::new(32.0, 32.0),
        );
        // Contents is a retained NSImage for the lifetime of the dragging item.
        unsafe {
            item.setDraggingFrame_contents(frame, Some(&image));
        }
        items.push(item);
    }
    let strings: Vec<_> = paths.iter().map(|path| NSString::from_str(path)).collect();
    let source = FileDragSource::alloc(mtm).set_ivars(DragData {
        origin: RefCell::new(DragOrigin {
            paths,
            source_paths,
            worktree_id,
            active: true,
            context: NSDraggingContext::WithinApplication,
            finished: None,
            consumed: false,
        }),
        complete: RefCell::new(Some(complete)),
    });
    let source: Retained<FileDragSource> = unsafe { msg_send![super(source), init] };
    SOURCE.with(|slot| *slot.borrow_mut() = Some(source.clone()));
    let session = view.beginDraggingSessionWithItems_event_source(
        &NSArray::from_retained_slice(&items),
        &event,
        ProtocolObject::from_ref(&*source),
    );
    session.setAnimatesToStartingPositionsOnCancelOrFail(true);
    // Wry currently reads the legacy file-list flavor. Keep the modern NSURL
    // items for Finder and add this compatibility representation for our own view.
    let legacy = NSString::from_str("NSFilenamesPboardType");
    let pasteboard = session.draggingPasteboard();
    unsafe {
        pasteboard.addTypes_owner(&NSArray::arrayWithObject(&*legacy), None);
        pasteboard.setPropertyList_forType(&NSArray::from_retained_slice(&strings), &legacy);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin() -> DragOrigin {
        DragOrigin {
            paths: vec!["/private/var/test".into()],
            source_paths: vec!["/var/test".into()],
            worktree_id: "workspace".into(),
            active: true,
            context: NSDraggingContext::WithinApplication,
            finished: None,
            consumed: false,
        }
    }

    #[test]
    fn recognizes_queued_internal_drop_once_even_after_source_ended() {
        let mut origin = origin();
        origin.finish(true);
        assert!(origin.take(&[PathBuf::from("/other")]).is_none());
        let (id, paths) = origin.take(&[PathBuf::from("/private/var/test")]).unwrap();
        assert_eq!(id, "workspace");
        assert_eq!(paths, vec!["/var/test"]);
        assert!(origin.take(&[PathBuf::from("/private/var/test")]).is_none());
    }

    #[test]
    fn does_not_confuse_finder_drags_or_cancelled_gestures_with_internal_moves() {
        for (context, accepted) in [
            (NSDraggingContext::OutsideApplication, true),
            (NSDraggingContext::WithinApplication, false),
        ] {
            let mut origin = origin();
            origin.context = context;
            origin.finish(accepted);
            assert!(origin.take(&[PathBuf::from("/private/var/test")]).is_none());
        }
        let mut origin = origin();
        origin.finish(true);
        origin.finished = Some(Instant::now() - Duration::from_secs(3));
        assert!(origin.take(&[PathBuf::from("/private/var/test")]).is_none());
    }
}
