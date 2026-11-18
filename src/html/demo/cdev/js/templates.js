// Starter files for "New project". Keys match languages in defaults/exec_settings.default.json.
export const TEMPLATES = {
  c: {
    main: 'src/main.c',
    files: {
      'src/main.c': `#include <stdio.h>

int main(void) {
    char name[64];
    printf("What is your name? ");
    fflush(stdout); /* make the prompt visible before reading input */
    if (scanf("%63s", name) == 1) {
        printf("Hello, %s!\\n", name);
    }
    return 0;
}
`,
    },
    gitignore: 'build/\n*.exe\n*.o\n',
  },
  cpp: {
    main: 'src/main.cpp',
    files: {
      'src/main.cpp': `#include <iostream>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> langs{"C", "C++", "Python", "Rust"};
    for (const auto& l : langs) {
        std::cout << "Hello from " << l << '\\n';
    }
    return 0;
}
`,
    },
    gitignore: 'build/\n*.exe\n*.o\n',
  },
  python: {
    main: 'main.py',
    files: {
      'main.py': `def main():
    name = input("What is your name? ")
    print(f"Hello, {name}!")


if __name__ == "__main__":
    main()
`,
      'requirements.txt': '',
    },
    gitignore: '.venv/\n__pycache__/\n*.pyc\n',
  },
  java: {
    main: 'src/Main.java',
    files: {
      'src/Main.java': `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.print("What is your name? ");
        String name = sc.nextLine();
        System.out.println("Hello, " + name + "!");
    }
}
`,
    },
    gitignore: 'build/\n*.class\n',
  },
  rust: {
    main: 'src/main.rs',
    files: {
      'src/main.rs': `use std::io::{self, Write};

fn main() {
    print!("What is your name? ");
    io::stdout().flush().unwrap();
    let mut name = String::new();
    io::stdin().read_line(&mut name).unwrap();
    println!("Hello, {}!", name.trim());
}
`,
    },
    gitignore: 'build/\ntarget/\n*.exe\n*.pdb\n',
  },
  'rust-cargo': {
    main: 'src/main.rs',
    files: (name) => ({
      'Cargo.toml': `[package]\nname = "${name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'app'}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`,
      'src/main.rs': 'fn main() {\n    println!("Hello from Cargo!");\n}\n',
    }),
    gitignore: 'target/\n',
  },
  javascript: {
    main: 'index.js',
    files: { 'index.js': `const langs = ['C', 'Python', 'Rust', 'JavaScript'];\nfor (const l of langs) console.log(\`Hello from \${l}\`);\n` },
    gitignore: 'node_modules/\n',
  },
  typescript: {
    main: 'index.ts',
    files: { 'index.ts': `function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('TypeScript'));\n` },
    gitignore: 'node_modules/\n',
  },
  go: {
    main: 'main.go',
    files: { 'main.go': 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from Go!")\n}\n' },
    gitignore: 'build/\n',
  },
  csharp: {
    main: 'Program.cs',
    files: (name) => ({
      [`${name || 'App'}.csproj`]: '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net8.0</TargetFramework>\n    <ImplicitUsings>enable</ImplicitUsings>\n    <Nullable>enable</Nullable>\n  </PropertyGroup>\n</Project>\n',
      'Program.cs': 'Console.WriteLine("Hello from C#!");\n',
    }),
    gitignore: 'bin/\nobj/\n',
  },
  php: { main: 'index.php', files: { 'index.php': '<?php\n\necho "Hello from PHP!\\n";\n' }, gitignore: '' },
  ruby: { main: 'main.rb', files: { 'main.rb': 'puts "Hello from Ruby!"\n' }, gitignore: '' },
  lua: { main: 'main.lua', files: { 'main.lua': 'print("Hello from Lua!")\n' }, gitignore: '' },
  shell: { main: 'main.sh', files: { 'main.sh': '#!/usr/bin/env bash\necho "Hello from Bash!"\n' }, gitignore: '' },
  html: {
    main: 'index.html',
    files: {
      'index.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My page</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <h1>Hello, web!</h1>
    <button id="btn">Click me</button>
    <p id="out"></p>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
      'style.css': `body {\n  font-family: system-ui, sans-serif;\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n  margin: 0;\n  background: #f4f6fb;\n}\n\nbutton {\n  padding: 8px 16px;\n  border-radius: 8px;\n  border: 0;\n  background: #3b82f6;\n  color: white;\n  cursor: pointer;\n}\n`,
      'script.js': `let count = 0;\ndocument.getElementById('btn').addEventListener('click', () => {\n  count++;\n  document.getElementById('out').textContent = \`Clicked \${count} time(s)\`;\n  console.log('clicked', count);\n});\n`,
    },
    gitignore: '',
  },
};

export function templateFiles(lang, name) {
  const t = TEMPLATES[lang];
  if (!t) return { main: null, files: {} };
  const files = typeof t.files === 'function' ? t.files(name) : t.files;
  return { main: t.main, files, gitignore: t.gitignore };
}
