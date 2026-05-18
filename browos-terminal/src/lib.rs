use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use js_sys::Promise;
use serde::{Serialize, Deserialize};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = window)]
    fn browos_fs_list(path: &str) -> Promise;
    
    #[wasm_bindgen(js_namespace = window)]
    fn browos_fs_read(path: &str) -> Promise;
    
    #[wasm_bindgen(js_namespace = window)]
    fn browos_fs_mkdir(path: &str) -> Promise;
    
    #[wasm_bindgen(js_namespace = window)]
    fn browos_fs_rm(path: &str) -> Promise;
    
    #[wasm_bindgen(js_namespace = window)]
    fn browos_fs_write(path: &str, content: &str) -> Promise;
    
    #[wasm_bindgen(js_namespace = window)]
    fn browos_http_fetch(url: &str, proxy: &str) -> Promise;
    
    #[wasm_bindgen(js_namespace = window)]
    fn browos_open_note(path: &str) -> Promise;
    
    #[wasm_bindgen(js_namespace = window)]
    fn browos_fs_move(src: &str, dest: &str) -> Promise;
}

#[derive(Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub kind: String,
}

#[derive(Serialize, Deserialize)]
struct HttpResponse {
    ok: bool,
    #[serde(default)]
    error: String,
    #[serde(default)]
    status: u16,
    #[serde(default, rename = "contentType")]
    content_type: String,
    #[serde(default, rename = "contentLength")]
    content_length: usize,
    #[serde(default)]
    data: String,
}

#[derive(Serialize, Deserialize)]
struct NoteResponse {
    ok: bool,
    #[serde(default)]
    error: String,
    #[serde(default)]
    path: String,
}

pub struct Shell {
    cwd: String,
    history: Vec<String>,
    env: std::collections::HashMap<String, String>,
}

impl Shell {
    pub fn new() -> Self {
        let mut env = std::collections::HashMap::new();
        env.insert("USER".to_string(), "browos-user".to_string());
        env.insert("HOSTNAME".to_string(), "browos".to_string());
        
        Shell {
            cwd: "/".to_string(),
            history: Vec::new(),
            env,
        }
    }

    pub async fn exec(&mut self, input: &str) -> String {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            return String::new();
        }

        self.history.push(trimmed.to_string());
        if self.history.len() > 100 {
            self.history.remove(0);
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        let cmd = parts[0];
        let args = &parts[1..];

        match cmd {
            "help" => self.cmd_help(),
            "clear" => "\x1b[2J\x1b[H".to_string(),
            "echo" => self.cmd_echo(args),
            "pwd" => self.cwd.clone(),
            "cd" => self.cmd_cd(args).await,
            "ls" => self.cmd_ls(args).await,
            "cat" => self.cmd_cat(args).await,
            "mkdir" => self.cmd_mkdir(args).await,
            "rm" => self.cmd_rm(args).await,
            "history" => self.cmd_history(),
            "whoami" => self.env.get("USER").unwrap_or(&"unknown".to_string()).clone(),
            "hostname" => self.env.get("HOSTNAME").unwrap_or(&"browos".to_string()).clone(),
            "date" => self.cmd_date(),
            "uname" => self.cmd_uname(args),
            "grep" => self.cmd_grep(args).await,
            "getnet" => self.cmd_getnet(args).await,
            "mv" => self.cmd_mv(args).await,
            "brow-note" => self.cmd_brow_note(args).await,
            _ => format!("\x1b[31mCommand not found: {}\x1b[0m", cmd),
        }
    }

    fn cmd_help(&self) -> String {
        [
            "\x1b[1mAvailable Commands:\x1b[0m",
            "  \x1b[36mhelp\x1b[0m       Show this help message",
            "  \x1b[36mclear\x1b[0m      Clear the terminal screen",
            "  \x1b[36mecho [text]\x1b[0m Print text to the terminal",
            "  \x1b[36mpwd\x1b[0m        Print current working directory",
            "  \x1b[36mcd [path]\x1b[0m   Change directory",
            "  \x1b[36mls [path]\x1b[0m   List directory contents",
            "  \x1b[36mcat [file]\x1b[0m  Display file contents",
            "  \x1b[36mmkdir [dir]\x1b[0m Create a directory",
            "  \x1b[36mrm [file]\x1b[0m   Remove a file or directory",
            "  \x1b[36mgrep [pat] [file]\x1b[0m Search for pattern in file",
            "  \x1b[36mgetnet [url]\x1b[0m Download file from URL",
            "  \x1b[36mmv [src] [dest]\x1b[0m Move or rename files",
            "  \x1b[36mbrow-note [file]\x1b[0m Open file in Brow Note app",
            "  \x1b[36mhistory\x1b[0m    Show command history",
            "  \x1b[36mwhoami\x1b[0m     Show current user",
            "  \x1b[36mhostname\x1b[0m   Show system hostname",
            "  \x1b[36mdate\x1b[0m       Show current date and time",
            "  \x1b[36muname [-a]\x1b[0m Show system information",
        ].join("\n")
    }

    fn cmd_echo(&self, args: &[&str]) -> String {
        args.join(" ")
    }

    async fn cmd_cd(&mut self, args: &[&str]) -> String {
        if args.is_empty() {
            self.cwd = "/".to_string();
            return String::new();
        }

        let target = if args[0].starts_with('/') {
            args[0].to_string()
        } else {
            if self.cwd == "/" {
                format!("/{}", args[0])
            } else {
                format!("{}/{}", self.cwd, args[0])
            }
        };

        // Normalize path (remove trailing slashes, handle ..)
        let normalized = self.normalize_path(&target);

        // Check if directory exists by trying to list it
        match JsFuture::from(browos_fs_list(&normalized)).await {
            Ok(_) => {
                self.cwd = normalized;
                String::new()
            }
            Err(_) => format!("\x1b[31mcd: {}: No such directory\x1b[0m", args[0]),
        }
    }

    async fn cmd_ls(&self, args: &[&str]) -> String {
        let path = if args.is_empty() {
            self.cwd.clone()
        } else {
            let target = if args[0].starts_with('/') {
                args[0].to_string()
            } else {
                if self.cwd == "/" {
                    format!("/{}", args[0])
                } else {
                    format!("{}/{}", self.cwd, args[0])
                }
            };
            self.normalize_path(&target)
        };

        match JsFuture::from(browos_fs_list(&path)).await {
            Ok(js_value) => {
                let entries: Vec<FsEntry> = serde_wasm_bindgen::from_value(js_value).unwrap_or_default();
                if entries.is_empty() {
                    return String::new();
                }
                
                let mut output = Vec::new();
                for entry in entries {
                    if entry.kind == "directory" {
                        output.push(format!("\x1b[34m{}/\x1b[0m", entry.name));
                    } else {
                        output.push(entry.name);
                    }
                }
                output.join("  ")
            }
            Err(_) => format!("\x1b[31mls: cannot access '{}': No such directory\x1b[0m", path),
        }
    }

    async fn cmd_cat(&self, args: &[&str]) -> String {
        if args.is_empty() {
            return "\x1b[31mcat: missing file operand\x1b[0m".to_string();
        }

        let path = if args[0].starts_with('/') {
            args[0].to_string()
        } else {
            if self.cwd == "/" {
                format!("/{}", args[0])
            } else {
                format!("{}/{}", self.cwd, args[0])
            }
        };

        match JsFuture::from(browos_fs_read(&path)).await {
            Ok(content) => content.as_string().unwrap_or_else(|| "[Binary file]".to_string()),
            Err(_) => format!("\x1b[31mcat: {}: No such file\x1b[0m", args[0]),
        }
    }

    async fn cmd_mkdir(&self, args: &[&str]) -> String {
        if args.is_empty() {
            return "\x1b[31mmkdir: missing directory operand\x1b[0m".to_string();
        }

        let path = if args[0].starts_with('/') {
            args[0].to_string()
        } else {
            if self.cwd == "/" {
                format!("/{}", args[0])
            } else {
                format!("{}/{}", self.cwd, args[0])
            }
        };

        match JsFuture::from(browos_fs_mkdir(&path)).await {
            Ok(_) => String::new(),
            Err(_) => format!("\x1b[31mmkdir: cannot create directory '{}'\x1b[0m", args[0]),
        }
    }

    async fn cmd_rm(&self, args: &[&str]) -> String {
        if args.is_empty() {
            return "\x1b[31mrm: missing file operand\x1b[0m".to_string();
        }

        let path = if args[0].starts_with('/') {
            args[0].to_string()
        } else {
            if self.cwd == "/" {
                format!("/{}", args[0])
            } else {
                format!("{}/{}", self.cwd, args[0])
            }
        };

        match JsFuture::from(browos_fs_rm(&path)).await {
            Ok(_) => String::new(),
            Err(_) => format!("\x1b[31mrm: cannot remove '{}'\x1b[0m", args[0]),
        }
    }

    fn cmd_history(&self) -> String {
        self.history.iter()
            .enumerate()
            .map(|(i, cmd)| format!("  {:4}  {}", i + 1, cmd))
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn cmd_date(&self) -> String {
        let now = chrono::Utc::now();
        now.format("%a %b %d %H:%M:%S UTC %Y").to_string()
    }

    fn cmd_uname(&self, args: &[&str]) -> String {
        if args.contains(&"-a") {
            "BrowOS 1.0.0 WASM x86_64 GNU/Linux".to_string()
        } else {
            "BrowOS".to_string()
        }
    }

    async fn cmd_grep(&self, args: &[&str]) -> String {
        if args.len() < 2 {
            return "\x1b[31mgrep: usage: grep PATTERN FILE\x1b[0m".to_string();
        }

        let pattern = args[0];
        let file_path = if args[1].starts_with('/') {
            args[1].to_string()
        } else {
            if self.cwd == "/" {
                format!("/{}", args[1])
            } else {
                format!("{}/{}", self.cwd, args[1])
            }
        };

        match JsFuture::from(browos_fs_read(&file_path)).await {
            Ok(content) => {
                let text = content.as_string().unwrap_or_default();
                let matches: Vec<&str> = text.lines()
                    .filter(|line| line.contains(pattern))
                    .collect();
                
                if matches.is_empty() {
                    String::new()
                } else {
                    matches.join("\n")
                }
            }
            Err(_) => format!("\x1b[31mgrep: {}: No such file\x1b[0m", args[1]),
        }
    }

    async fn cmd_getnet(&self, args: &[&str]) -> String {
        if args.is_empty() {
            return "\x1b[31mgetnet: missing URL operand\x1b[0m\n\x1b[1mUsage:\x1b[0m getnet <url> [-o|--out <file>] [-v|--verbose]".to_string();
        }

        let mut url = None;
        let mut output_file = None;
        let mut verbose = false;

        let mut i = 0;
        while i < args.len() {
            match args[i] {
                "-o" | "--out" => {
                    if i + 1 >= args.len() {
                        return format!("\x1b[31mgetnet: {} requires a value\x1b[0m", args[i]);
                    }
                    output_file = Some(args[i + 1].to_string());
                    i += 2;
                }
                "-v" | "--verbose" => {
                    verbose = true;
                    i += 1;
                }
                arg if !arg.starts_with('-') => {
                    if url.is_none() {
                        url = Some(arg.to_string());
                    } else {
                        return format!("\x1b[31mgetnet: unexpected argument '{}'\x1b[0m", arg);
                    }
                    i += 1;
                }
                unknown => {
                    return format!("\x1b[31mgetnet: unknown flag '{}'\x1b[0m", unknown);
                }
            }
        }

        let url = match url {
            Some(u) => u,
            None => return "\x1b[31mgetnet: missing URL operand\x1b[0m".to_string(),
        };

        if !url.starts_with("http://") && !url.starts_with("https://") {
            return "\x1b[31mgetnet: URL must start with http:// or https://\x1b[0m".to_string();
        }

        let filename = output_file.unwrap_or_else(|| self.derive_filename(&url));
        let file_path = if self.cwd == "/" {
            format!("/{}", filename)
        } else {
            format!("{}/{}", self.cwd, filename)
        };

        let mut output_lines = Vec::new();

        if verbose {
            output_lines.push(format!("\x1b[36mFetching {}\x1b[0m", url));
        }

        let mut response = self.do_fetch(&url, "").await;

        if !response.ok && verbose {
            output_lines.push("\x1b[33mDirect fetch failed, retrying via proxy...\x1b[0m".to_string());
        }

        if !response.ok {
            let proxy_url = "https://corsproxy.io/?";
            response = self.do_fetch(&url, proxy_url).await;
        }

        if !response.ok {
            return format!("\x1b[31mgetnet: {}\x1b[0m", response.error);
        }

        if verbose {
            output_lines.push(format!("\x1b[36mHTTP {}\x1b[0m {}", response.status, response.content_type));
            output_lines.push(format!("\x1b[36mSize:\x1b[0m {} bytes", response.content_length));
        }

        let decoded = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &response.data) {
            Ok(bytes) => bytes,
            Err(e) => return format!("\x1b[31mgetnet: failed to decode response: {}\x1b[0m", e),
        };

        let content = String::from_utf8_lossy(&decoded).to_string();

        match JsFuture::from(browos_fs_write(&file_path, &content)).await {
            Ok(_) => {
                if verbose {
                    output_lines.push(format!("\x1b[32mSaved to {}\x1b[0m ({} bytes)", filename, decoded.len()));
                } else {
                    output_lines.push(format!("\x1b[32mSaved {}\x1b[0m ({} bytes)", filename, decoded.len()));
                }
            }
            Err(_) => {
                return format!("\x1b[31mgetnet: failed to save file '{}'\x1b[0m", filename);
            }
        }

        output_lines.join("\n")
    }

    async fn do_fetch(&self, url: &str, proxy: &str) -> HttpResponse {
        match JsFuture::from(browos_http_fetch(url, proxy)).await {
            Ok(js_value) => {
                serde_wasm_bindgen::from_value(js_value).unwrap_or(HttpResponse {
                    ok: false,
                    error: "failed to parse response".to_string(),
                    status: 0,
                    content_type: String::new(),
                    content_length: 0,
                    data: String::new(),
                })
            }
            Err(_) => HttpResponse {
                ok: false,
                error: "fetch call failed".to_string(),
                status: 0,
                content_type: String::new(),
                content_length: 0,
                data: String::new(),
            }
        }
    }

    fn derive_filename(&self, url: &str) -> String {
        let path_part = if let Some(pos) = url.find('?') {
            &url[..pos]
        } else {
            url
        };

        if let Some(pos) = path_part.rfind('/') {
            let after_slash = &path_part[pos + 1..];
            if !after_slash.is_empty() {
                return after_slash.to_string();
            }
        }

        "download".to_string()
    }

    async fn cmd_mv(&self, args: &[&str]) -> String {
        if args.len() < 2 {
            return "\x1b[31mmv: missing operand\x1b[0m\n\x1b[1mUsage:\x1b[0m mv [OPTION]... SOURCE DEST\n  \x1b[36m-i\x1b[0m  Prompt before overwrite\n  \x1b[36m-n\x1b[0m  Never overwrite\n  \x1b[36m-v\x1b[0m  Verbose output".to_string();
        }

        let mut no_clobber = false;
        let mut verbose = false;
        let mut sources: Vec<String> = Vec::new();
        let mut dest_str: Option<String> = None;

        let mut i = 0;
        while i < args.len() {
            match args[i] {
                "-i" => { i += 1; }
                "-n" => { no_clobber = true; i += 1; }
                "-v" => { verbose = true; i += 1; }
                arg if !arg.starts_with('-') => {
                    if dest_str.is_some() {
                        return format!("\x1b[31mmv: extra operand '{}'\x1b[0m", arg);
                    }
                    sources.push(arg.to_string());
                    i += 1;
                }
                unknown => {
                    return format!("\x1b[31mmv: invalid option '{}'\x1b[0m", unknown);
                }
            }
        }

        if sources.len() > 1 {
            dest_str = Some(sources.pop().unwrap());
        } else if sources.len() == 1 {
            return "\x1b[31mmv: missing destination operand\x1b[0m".to_string();
        }

        let dest_path = match dest_str {
            Some(d) => {
                if d.starts_with('/') {
                    self.normalize_path(&d)
                } else {
                    self.normalize_path(&format!("{}/{}", self.cwd, d))
                }
            }
            None => return "\x1b[31mmv: missing destination\x1b[0m".to_string(),
        };

        let dest_handle = match JsFuture::from(browos_fs_list(&dest_path)).await {
            Ok(_) => Some(dest_path.clone()),
            Err(_) => None,
        };

        let mut results = Vec::new();

        for src in &sources {
            let src_path = if src.starts_with('/') {
                self.normalize_path(src)
            } else {
                self.normalize_path(&format!("{}/{}", self.cwd, src))
            };

            let full_dest = if let Some(ref dest_dir) = dest_handle {
                let src_name = src.split('/').filter(|s| !s.is_empty()).last().unwrap_or(src);
                if dest_dir.ends_with('/') {
                    format!("{}{}", dest_dir, src_name)
                } else {
                    format!("{}/{}", dest_dir, src_name)
                }
            } else {
                dest_path.clone()
            };

            if no_clobber {
                if let Ok(_) = JsFuture::from(browos_fs_list(&full_dest)).await {
                    results.push(format!("\x1b[33mmv: not overwriting '{}'\x1b[0m", full_dest));
                    continue;
                }
            }

            match JsFuture::from(browos_fs_move(&src_path, &full_dest)).await {
                Ok(_) => {
                    if verbose {
                        results.push(format!("'{}' -> '{}'", src, full_dest));
                    }
                }
                Err(e) => {
                    let err_msg = e.as_string().unwrap_or_else(|| "unknown error".to_string());
                    results.push(format!("\x1b[31mmv: cannot move '{}' -> '{}': {}\x1b[0m", src, full_dest, err_msg));
                }
            }
        }

        results.join("\n")
    }

    async fn cmd_brow_note(&self, args: &[&str]) -> String {
        if args.is_empty() {
            return "\x1b[31mbrow-note: missing file operand\x1b[0m\n\x1b[1mUsage:\x1b[0m brow-note <file>".to_string();
        }

        let path = if args[0].starts_with('/') {
            args[0].to_string()
        } else {
            if self.cwd == "/" {
                format!("/{}", args[0])
            } else {
                format!("{}/{}", self.cwd, args[0])
            }
        };

        match JsFuture::from(browos_open_note(&path)).await {
            Ok(js_value) => {
                let response: NoteResponse = serde_wasm_bindgen::from_value(js_value).unwrap_or(NoteResponse {
                    ok: false,
                    error: "failed to parse response".to_string(),
                    path: String::new(),
                });
                
                if response.ok {
                    format!("\x1b[32mOpened {} in Brow Note\x1b[0m", path)
                } else {
                    format!("\x1b[31mbrow-note: {}\x1b[0m", response.error)
                }
            }
            Err(_) => "\x1b[31mbrow-note: failed to open file\x1b[0m".to_string(),
        }
    }

    fn normalize_path(&self, path: &str) -> String {
        let mut components = Vec::new();
        for part in path.split('/') {
            match part {
                "" | "." => continue,
                ".." => { components.pop(); }
                _ => components.push(part),
            }
        }
        
        if components.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", components.join("/"))
        }
    }
}

#[wasm_bindgen]
pub struct WasmShell {
    shell: Shell,
}

#[wasm_bindgen]
impl WasmShell {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmShell {
        WasmShell {
            shell: Shell::new(),
        }
    }

    #[wasm_bindgen]
    pub async fn exec(&mut self, input: &str) -> String {
        self.shell.exec(input).await
    }

    #[wasm_bindgen]
    pub fn get_cwd(&self) -> String {
        self.shell.cwd.clone()
    }
}