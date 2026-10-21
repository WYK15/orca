fn main() {
    println!(
        "cargo:rustc-env=ORCA_TARGET_TRIPLE={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
