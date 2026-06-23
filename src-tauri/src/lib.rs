use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

const DATA_SUBDIRS: &[&str] = &[
    "assets",
    "assets/avatars",
    "assets/generated-images",
    "assets/wallpapers",
    "logs",
    "config",
    "zhiku",
    "worldbooks",
];
const STORAGE_ROOTS_PATH: &str = "config/desktop-storage.json";
const STORAGE_ROOTS_KIND: &str = "kaituoyishi-desktop-storage";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAppInfo {
    product_name: String,
    version: String,
    identifier: String,
    app_data_dir: String,
    save_dir: String,
    backup_dir: String,
    asset_dir: String,
    log_dir: String,
    config_dir: String,
    zhiku_dir: String,
    worldbook_dir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopProbeResult {
    ok: bool,
    app_data_dir: String,
    probe_file: String,
    written_at_ms: u128,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStorageRoots {
    kind: String,
    version: u8,
    updated_at: u128,
    save_dir: Option<String>,
    backup_dir: Option<String>,
}

#[tauri::command]
fn desktop_app_info(app: AppHandle) -> Result<DesktopAppInfo, String> {
    let app_data_dir = ensure_app_data_dirs(&app)?;
    let save_dir = resolve_storage_root(&app, &app_data_dir, "saves")?;
    let backup_dir = resolve_storage_root(&app, &app_data_dir, "backups")?;
    Ok(DesktopAppInfo {
        product_name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        identifier: app.config().identifier.clone(),
        save_dir: path_to_string(&save_dir),
        backup_dir: path_to_string(&backup_dir),
        asset_dir: path_to_string(&app_data_dir.join("assets")),
        log_dir: path_to_string(&app_data_dir.join("logs")),
        config_dir: path_to_string(&app_data_dir.join("config")),
        zhiku_dir: path_to_string(&app_data_dir.join("zhiku")),
        worldbook_dir: path_to_string(&app_data_dir.join("worldbooks")),
        app_data_dir: path_to_string(&app_data_dir),
    })
}

#[tauri::command]
fn write_desktop_probe(app: AppHandle) -> Result<DesktopProbeResult, String> {
    let app_data_dir = ensure_app_data_dirs(&app)?;
    let probe_dir = app_data_dir.join("logs");
    fs::create_dir_all(&probe_dir).map_err(|err| format!("创建日志目录失败: {err}"))?;

    let written_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|err| format!("读取系统时间失败: {err}"))?
        .as_millis();
    let probe_file = probe_dir.join("desktop-probe.json");
    let payload = serde_json::json!({
        "kind": "kaituoyishi-desktop-probe",
        "writtenAtMs": written_at_ms,
        "appDataDir": path_to_string(&app_data_dir),
    });
    fs::write(
        &probe_file,
        serde_json::to_string_pretty(&payload).map_err(|err| format!("序列化探针失败: {err}"))?,
    )
    .map_err(|err| format!("写入桌面探针失败: {err}"))?;

    Ok(DesktopProbeResult {
        ok: true,
        app_data_dir: path_to_string(&app_data_dir),
        probe_file: path_to_string(&probe_file),
        written_at_ms,
    })
}

#[tauri::command]
fn pick_desktop_folder() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .set_title("选择目录")
        .pick_folder()
        .map(|path| path_to_string(&path)))
}

#[tauri::command]
fn set_desktop_storage_roots(
    app: AppHandle,
    save_dir: Option<String>,
    backup_dir: Option<String>,
) -> Result<DesktopAppInfo, String> {
    let app_data_dir = ensure_app_data_dir(&app)?;
    let current_roots = load_storage_roots(&app_data_dir)?;
    let next_save_dir = normalize_storage_root_input(save_dir.as_deref(), "saves")?;
    let next_backup_dir = normalize_storage_root_input(backup_dir.as_deref(), "backups")?;

    if current_roots.save_dir.as_deref() != next_save_dir.as_deref() {
        let from = resolve_storage_root_from_option(&app_data_dir, current_roots.save_dir.as_deref(), "saves")?;
        let to = resolve_storage_root_from_option(&app_data_dir, next_save_dir.as_deref(), "saves")?;
        migrate_storage_root(&from, &to)?;
    }
    if current_roots.backup_dir.as_deref() != next_backup_dir.as_deref() {
        let from = resolve_storage_root_from_option(&app_data_dir, current_roots.backup_dir.as_deref(), "backups")?;
        let to = resolve_storage_root_from_option(&app_data_dir, next_backup_dir.as_deref(), "backups")?;
        migrate_storage_root(&from, &to)?;
    }

    write_storage_roots(
        &app_data_dir,
        DesktopStorageRoots {
            kind: STORAGE_ROOTS_KIND.to_string(),
            version: 1,
            updated_at: current_timestamp_ms()?,
            save_dir: next_save_dir,
            backup_dir: next_backup_dir,
        },
    )?;

    desktop_app_info(app)
}

#[tauri::command]
fn desktop_read_text(app: AppHandle, relative_path: String) -> Result<Option<String>, String> {
    let file_path = resolve_data_path(&app, &relative_path)?;
    if !file_path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&file_path)
        .map(Some)
        .map_err(|err| format!("读取桌面文件失败({relative_path}): {err}"))
}

#[tauri::command]
fn desktop_write_text(app: AppHandle, relative_path: String, content: String) -> Result<(), String> {
    let file_path = resolve_data_path(&app, &relative_path)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建桌面文件目录失败({relative_path}): {err}"))?;
    }
    fs::write(&file_path, content).map_err(|err| format!("写入桌面文件失败({relative_path}): {err}"))
}

#[tauri::command]
fn desktop_write_text_atomic(app: AppHandle, relative_path: String, content: String) -> Result<(), String> {
    let file_path = resolve_data_path(&app, &relative_path)?;
    write_text_atomically(&file_path, &content)
        .map_err(|err| format!("atomic desktop text write failed ({relative_path}): {err}"))
}

#[tauri::command]
fn desktop_write_base64_file(
    app: AppHandle,
    relative_path: String,
    base64_content: String,
) -> Result<(), String> {
    let file_path = resolve_data_path(&app, &relative_path)?;
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建桌面文件目录失败({relative_path}): {err}"))?;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_content.trim())
        .map_err(|err| format!("解析 base64 图片失败({relative_path}): {err}"))?;
    fs::write(&file_path, bytes).map_err(|err| format!("写入桌面图片失败({relative_path}): {err}"))
}

#[tauri::command]
fn desktop_read_base64_file(app: AppHandle, relative_path: String) -> Result<Option<String>, String> {
    let file_path = resolve_data_path(&app, &relative_path)?;
    if !file_path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&file_path)
        .map_err(|err| format!("read desktop binary file failed ({relative_path}): {err}"))?;
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
fn desktop_list(app: AppHandle, relative_path: String) -> Result<Vec<String>, String> {
    let dir_path = resolve_data_path(&app, &relative_path)?;
    if !dir_path.exists() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(&dir_path)
        .map_err(|err| format!("读取桌面目录失败({relative_path}): {err}"))?;
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| format!("读取桌面目录项失败({relative_path}): {err}"))?;
        names.push(entry.file_name().to_string_lossy().to_string());
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
fn desktop_remove(app: AppHandle, relative_path: String) -> Result<(), String> {
    let file_path = resolve_data_path(&app, &relative_path)?;
    if !file_path.exists() {
        return Ok(());
    }
    if file_path.is_dir() {
        fs::remove_dir_all(&file_path)
            .map_err(|err| format!("删除桌面目录失败({relative_path}): {err}"))?;
    } else {
        fs::remove_file(&file_path)
            .map_err(|err| format!("删除桌面文件失败({relative_path}): {err}"))?;
    }
    Ok(())
}

#[tauri::command]
fn open_desktop_data_dir(app: AppHandle, target: String) -> Result<(), String> {
    let app_data_dir = ensure_app_data_dirs(&app)?;
    let dir = match target.as_str() {
        "saves" => resolve_storage_root(&app, &app_data_dir, "saves")?,
        "backups" => resolve_storage_root(&app, &app_data_dir, "backups")?,
        "logs" => app_data_dir.join("logs"),
        "assets" => app_data_dir.join("assets"),
        "config" => app_data_dir.join("config"),
        "zhiku" => app_data_dir.join("zhiku"),
        "worldbooks" => app_data_dir.join("worldbooks"),
        _ => app_data_dir,
    };
    open_directory(&dir)
}

fn ensure_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("解析应用数据目录失败: {err}"))?;
    fs::create_dir_all(&app_data_dir).map_err(|err| format!("创建应用数据目录失败: {err}"))?;
    let config_dir = app_data_dir.join("config");
    fs::create_dir_all(&config_dir).map_err(|err| format!("创建配置目录失败: {err}"))?;
    Ok(app_data_dir)
}

fn ensure_app_data_dirs(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = ensure_app_data_dir(app)?;
    fs::create_dir_all(&app_data_dir).map_err(|err| format!("创建应用数据目录失败: {err}"))?;
    for subdir in DATA_SUBDIRS {
        fs::create_dir_all(app_data_dir.join(subdir))
            .map_err(|err| format!("创建桌面数据子目录失败({subdir}): {err}"))?;
    }
    let save_dir = resolve_storage_root(app, &app_data_dir, "saves")?;
    let backup_dir = resolve_storage_root(app, &app_data_dir, "backups")?;
    fs::create_dir_all(save_dir).map_err(|err| format!("创建桌面存档目录失败: {err}"))?;
    fs::create_dir_all(backup_dir).map_err(|err| format!("创建桌面备份目录失败: {err}"))?;
    Ok(app_data_dir)
}

fn resolve_data_path(app: &AppHandle, relative_path: &str) -> Result<PathBuf, String> {
    let clean_path = normalize_relative_path(relative_path)?;
    let app_data_dir = ensure_app_data_dirs(app)?;
    let mut components = clean_path.components();
    let first = components.next().and_then(|part| part.as_os_str().to_str());
    match first {
        Some("saves") => Ok(resolve_storage_root(app, &app_data_dir, "saves")?.join(components.as_path())),
        Some("backups") => Ok(resolve_storage_root(app, &app_data_dir, "backups")?.join(components.as_path())),
        _ => Ok(app_data_dir.join(clean_path)),
    }
}

fn resolve_storage_root(_app: &AppHandle, app_data_dir: &Path, target: &str) -> Result<PathBuf, String> {
    let roots = load_storage_roots(app_data_dir)?;
    match target {
        "saves" => resolve_storage_root_from_option(app_data_dir, roots.save_dir.as_deref(), "saves"),
        "backups" => resolve_storage_root_from_option(app_data_dir, roots.backup_dir.as_deref(), "backups"),
        _ => Ok(app_data_dir.join(target)),
    }
}

fn resolve_storage_root_from_option(
    app_data_dir: &Path,
    value: Option<&str>,
    target: &str,
) -> Result<PathBuf, String> {
    if let Some(path) = value {
        validate_absolute_storage_path(path)?;
        return Ok(PathBuf::from(path));
    }
    Ok(app_data_dir.join(target))
}

fn normalize_storage_root_input(value: Option<&str>, target: &str) -> Result<Option<String>, String> {
    match value.map(str::trim) {
        None | Some("") => Ok(None),
        Some(path) => {
            validate_absolute_storage_path(path)?;
            let normalized = path.replace('/', "\\");
            if normalized.eq_ignore_ascii_case(target) {
                return Err(format!("存储目录不能直接指向 {target}"));
            }
            Ok(Some(normalized))
        }
    }
}

fn validate_absolute_storage_path(path: &str) -> Result<(), String> {
    if Path::new(path).is_absolute() {
        Ok(())
    } else {
        Err(format!("存储目录必须是绝对路径: {path}"))
    }
}

fn load_storage_roots(app_data_dir: &Path) -> Result<DesktopStorageRoots, String> {
    let path = app_data_dir.join(STORAGE_ROOTS_PATH);
    if !path.exists() {
        return Ok(DesktopStorageRoots {
            kind: STORAGE_ROOTS_KIND.to_string(),
            version: 1,
            updated_at: 0,
            save_dir: None,
            backup_dir: None,
        });
    }
    let raw = fs::read_to_string(&path).map_err(|err| format!("读取桌面存储配置失败: {err}"))?;
    let roots = serde_json::from_str::<DesktopStorageRoots>(&raw)
        .map_err(|err| format!("解析桌面存储配置失败: {err}"))?;
    if roots.kind != STORAGE_ROOTS_KIND || roots.version != 1 {
        return Ok(DesktopStorageRoots {
            kind: STORAGE_ROOTS_KIND.to_string(),
            version: 1,
            updated_at: 0,
            save_dir: None,
            backup_dir: None,
        });
    }
    Ok(roots)
}

fn write_storage_roots(app_data_dir: &Path, roots: DesktopStorageRoots) -> Result<(), String> {
    let path = app_data_dir.join(STORAGE_ROOTS_PATH);
    let payload = serde_json::to_string_pretty(&roots)
        .map_err(|err| format!("序列化桌面存储配置失败: {err}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建桌面存储配置目录失败: {err}"))?;
    }
    fs::write(&path, payload).map_err(|err| format!("写入桌面存储配置失败: {err}"))
}

fn current_timestamp_ms() -> Result<u128, String> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|err| format!("读取系统时间失败: {err}"))?
        .as_millis())
}

fn migrate_storage_root(from: &Path, to: &Path) -> Result<(), String> {
    if from == to {
        return Ok(());
    }
    fs::create_dir_all(to).map_err(|err| format!("创建目标目录失败: {err}"))?;
    if !from.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(from).map_err(|err| format!("读取源目录失败: {err}"))? {
        let entry = entry.map_err(|err| format!("读取源目录项失败: {err}"))?;
        let source_path = entry.path();
        let target_path = to.join(entry.file_name());
        move_path(&source_path, &target_path)?;
    }
    let _ = fs::remove_dir_all(from);
    Ok(())
}

fn move_path(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        if target.is_dir() {
            fs::remove_dir_all(target).map_err(|err| format!("清理目标目录失败: {err}"))?;
        } else {
            fs::remove_file(target).map_err(|err| format!("清理目标文件失败: {err}"))?;
        }
    }
    if fs::rename(source, target).is_ok() {
        return Ok(());
    }
    if source.is_dir() {
        copy_dir_recursive(source, target)?;
        fs::remove_dir_all(source).map_err(|err| format!("删除源目录失败: {err}"))?;
        Ok(())
    } else {
        fs::copy(source, target).map_err(|err| format!("复制文件失败: {err}"))?;
        fs::remove_file(source).map_err(|err| format!("删除源文件失败: {err}"))?;
        Ok(())
    }
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|err| format!("创建目标目录失败: {err}"))?;
    for entry in fs::read_dir(source).map_err(|err| format!("读取目录失败: {err}"))? {
        let entry = entry.map_err(|err| format!("读取目录项失败: {err}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(|err| format!("复制文件失败: {err}"))?;
        }
    }
    Ok(())
}

fn write_text_atomically(file_path: &Path, content: &str) -> Result<(), String> {
    let parent = file_path
        .parent()
        .ok_or_else(|| "desktop data file must have a parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|err| format!("create parent directory failed: {err}"))?;

    let file_name = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "desktop data file name is invalid".to_string())?;
    let written_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|err| format!("read system time failed: {err}"))?
        .as_millis();
    let temp_path = parent.join(format!(".{file_name}.{written_at_ms}.tmp"));

    let write_result = (|| -> Result<(), String> {
        let mut temp_file = fs::File::create(&temp_path)
            .map_err(|err| format!("create temp file failed: {err}"))?;
        temp_file
            .write_all(content.as_bytes())
            .map_err(|err| format!("write temp file failed: {err}"))?;
        temp_file
            .sync_all()
            .map_err(|err| format!("sync temp file failed: {err}"))?;
        drop(temp_file);
        if file_path.exists() {
            fs::remove_file(file_path).map_err(|err| format!("remove old file failed: {err}"))?;
        }
        fs::rename(&temp_path, file_path).map_err(|err| format!("rename temp file failed: {err}"))?;
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result
}

fn normalize_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let mut clean_path = PathBuf::new();
    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(part) => clean_path.push(part),
            Component::CurDir => {}
            _ => return Err(format!("桌面数据路径不合法: {relative_path}")),
        }
    }
    if clean_path.as_os_str().is_empty() {
        return Err("桌面数据路径不能为空".to_string());
    }
    Ok(clean_path)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "\\")
}

fn open_directory(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .arg(path)
        .status()
        .map_err(|err| format!("打开本地目录失败: {err}"))?;

    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg(path)
        .status()
        .map_err(|err| format!("打开本地目录失败: {err}"))?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(path)
        .status()
        .map_err(|err| format!("打开本地目录失败: {err}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("打开本地目录失败，退出码: {:?}", status.code()))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            desktop_app_info,
            write_desktop_probe,
            pick_desktop_folder,
            set_desktop_storage_roots,
            desktop_read_text,
            desktop_write_text,
            desktop_write_text_atomic,
            desktop_write_base64_file,
            desktop_read_base64_file,
            desktop_list,
            desktop_remove,
            open_desktop_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running kaituoyishi desktop application");
}
