// Keyword + snippet completion for languages Monaco only highlights (JS/TS/CSS/HTML/JSON already have full IntelliSense).
const monaco = window.monaco;

const KW = {
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool bool true false NULL size_t uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t FILE printf scanf fprintf sprintf snprintf puts gets fgets fopen fclose fread fwrite malloc calloc realloc free memcpy memset memmove strlen strcpy strncpy strcmp strncmp strcat strstr strchr atoi atof exit abs rand srand time',
  cpp: 'alignas alignof and auto bool break case catch char char16_t char32_t class const constexpr consteval constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile while std cout cin cerr endl string vector map unordered_map set unordered_set pair tuple array deque list queue stack priority_queue optional variant unique_ptr shared_ptr make_unique make_shared move forward sort find begin end size push_back emplace_back getline to_string',
  python: 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print input len range enumerate zip map filter sorted reversed list dict set tuple str int float bool open isinstance super property staticmethod classmethod self __init__ __name__ __main__ min max sum abs round any all type dir help format',
  java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public record return short static strictfp super switch synchronized this throw throws transient try var void volatile while true false null String System out println print printf Math List ArrayList Map HashMap Set HashSet Scanner Integer Double Boolean Arrays Collections Optional StringBuilder Override',
  rust: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while Some None Ok Err Option Result Vec String Box Rc Arc HashMap HashSet println print format vec panic assert assert_eq unwrap expect clone to_string iter collect len push',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota append cap close copy delete len make new panic print println recover string int int64 float64 bool byte rune error fmt Println Printf Sprintf Errorf',
  csharp: 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await Console WriteLine ReadLine List Dictionary',
  php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while yield true false null',
  ruby: 'BEGIN END alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield puts print gets require attr_accessor attr_reader each map select',
  lua: 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while print pairs ipairs require table string math',
  shell: 'if then else elif fi case esac for select while until do done in function time echo read exit export local return shift source',
};

const S = (label, body, doc) => ({ label, body, doc });
const SNIP = {
  c: [
    S('main', '#include <stdio.h>\n\nint main(void) {\n\t${0}\n\treturn 0;\n}', 'main function'),
    S('for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', 'for loop'),
    S('while', 'while (${1:cond}) {\n\t${0}\n}', 'while loop'),
    S('if', 'if (${1:cond}) {\n\t${0}\n}', 'if'),
    S('printf', 'printf("${1:%d}\\n", ${2:x});', 'printf'),
    S('scanf', 'scanf("${1:%d}", &${2:x});', 'scanf'),
    S('struct', 'typedef struct {\n\t${0}\n} ${1:Name};', 'typedef struct'),
    S('inc', '#include <${1:stdio.h}>', 'include'),
  ],
  cpp: [
    S('main', '#include <iostream>\n\nint main() {\n\t${0}\n\treturn 0;\n}', 'main function'),
    S('for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t${0}\n}', 'for loop'),
    S('forr', 'for (auto& ${1:x} : ${2:v}) {\n\t${0}\n}', 'range for'),
    S('cout', 'std::cout << ${1} << std::endl;', 'cout'),
    S('cin', 'std::cin >> ${1};', 'cin'),
    S('class', 'class ${1:Name} {\npublic:\n\t${1:Name}() = default;\n\t${0}\nprivate:\n};', 'class'),
    S('inc', '#include <${1:iostream}>', 'include'),
  ],
  python: [
    S('main', 'def main():\n\t${0:pass}\n\n\nif __name__ == "__main__":\n\tmain()', 'main guard'),
    S('def', 'def ${1:name}(${2}):\n\t${0:pass}', 'function'),
    S('class', 'class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t${0:pass}', 'class'),
    S('for', 'for ${1:x} in ${2:items}:\n\t${0:pass}', 'for loop'),
    S('fori', 'for ${1:i} in range(${2:n}):\n\t${0:pass}', 'for range'),
    S('with', 'with open(${1:"file.txt"}, "${2:r}", encoding="utf-8") as ${3:f}:\n\t${0:pass}', 'with open'),
    S('try', 'try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${0:print(e)}', 'try/except'),
    S('ifmain', 'if __name__ == "__main__":\n\t${0:main()}', 'if __name__'),
  ],
  java: [
    S('main', 'public static void main(String[] args) {\n\t${0}\n}', 'main method'),
    S('sout', 'System.out.println(${1});', 'println'),
    S('fori', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', 'for loop'),
    S('fore', 'for (${1:var} ${2:x} : ${3:items}) {\n\t${0}\n}', 'for each'),
    S('class', 'public class ${1:Name} {\n\t${0}\n}', 'class'),
    S('scanner', 'Scanner ${1:sc} = new Scanner(System.in);', 'Scanner'),
  ],
  rust: [
    S('main', 'fn main() {\n\t${0}\n}', 'main'),
    S('fn', 'fn ${1:name}(${2}) ${3:-> ()} {\n\t${0}\n}', 'function'),
    S('println', 'println!("${1:{}}", ${2});', 'println!'),
    S('for', 'for ${1:x} in ${2:iter} {\n\t${0}\n}', 'for loop'),
    S('match', 'match ${1:value} {\n\t${2:_} => ${0},\n}', 'match'),
    S('struct', '#[derive(Debug)]\nstruct ${1:Name} {\n\t${0}\n}', 'struct'),
    S('impl', 'impl ${1:Name} {\n\t${0}\n}', 'impl'),
  ],
  go: [
    S('main', 'package main\n\nimport "fmt"\n\nfunc main() {\n\t${0}\n}', 'main'),
    S('func', 'func ${1:name}(${2}) ${3} {\n\t${0}\n}', 'func'),
    S('for', 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n\t${0}\n}', 'for'),
    S('iferr', 'if err != nil {\n\t${0:return err}\n}', 'if err'),
    S('pl', 'fmt.Println(${0})', 'Println'),
  ],
  csharp: [
    S('cw', 'Console.WriteLine(${0});', 'WriteLine'),
    S('for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++)\n{\n\t${0}\n}', 'for'),
    S('foreach', 'foreach (var ${1:x} in ${2:items})\n{\n\t${0}\n}', 'foreach'),
  ],
};

export function registerLanguageHelpers() {
  for (const [lang, words] of Object.entries(KW)) {
    const list = [...new Set(words.split(/\s+/))];
    const snippets = SNIP[lang] || [];
    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems(model, position) {
        const w = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, w.startColumn, position.lineNumber, w.endColumn);
        return {
          suggestions: [
            ...snippets.map(s => ({
              label: s.label, kind: monaco.languages.CompletionItemKind.Snippet, documentation: s.doc, detail: 'snippet',
              insertText: s.body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: '0' + s.label,
            })),
            ...list.map(k => ({ label: k, kind: monaco.languages.CompletionItemKind.Keyword, insertText: k, range, sortText: '1' + k })),
          ],
        };
      },
    });
  }
}

// AI ghost-text completions for every language
export function registerInlineAI(ai, getPath) {
  let seq = 0;
  monaco.languages.registerInlineCompletionsProvider('*', {
    async provideInlineCompletions(model, position, _ctx, token) {
      if (!ai.cfg.inline || !ai.configured()) return { items: [] };
      const my = ++seq;
      await new Promise(r => setTimeout(r, 650));
      if (token.isCancellationRequested || my !== seq) return { items: [] };
      const full = model.getValue();
      const offset = model.getOffsetAt(position);
      const prefix = full.slice(Math.max(0, offset - 6000), offset);
      const suffix = full.slice(offset, offset + 2000);
      if (!prefix.trim()) return { items: [] };
      const ac = new AbortController();
      token.onCancellationRequested(() => ac.abort());
      try {
        const text = await ai.inlineComplete({ prefix, suffix, language: model.getLanguageId(), path: getPath(model), signal: ac.signal });
        if (!text || token.isCancellationRequested) return { items: [] };
        return { items: [{ insertText: text, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] };
      } catch { return { items: [] }; }
    },
    freeInlineCompletions() {},
    disposeInlineCompletions() {},
  });
}
