const TLXParser = (() => {
  function removeComments(source) {
    return source
      .split("\n")
      .filter((line) => !line.trim().startsWith("%"))
      .join("\n");
  }

  function parseBracedGroup(source, startIndex) {
    if (source[startIndex] !== "{") {
      return null;
    }

    let depth = 0;
    let content = "";
    let i = startIndex;

    while (i < source.length) {
      const char = source[i];

      if (char === "{") {
        depth += 1;

        if (depth > 1) {
          content += char;
        }
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return {
            content: content.trim(),
            endIndex: i + 1
          };
        }

        content += char;
      } else {
        content += char;
      }

      i += 1;
    }

    throw new Error("Unclosed TLX block.");
  }

  function readCommandGroups(source, index) {
    const groups = [];
    let i = index;

    while (i < source.length) {
      while (/\s/.test(source[i])) {
        i += 1;
      }

      if (source[i] !== "{") {
        break;
      }

      const group = parseBracedGroup(source, i);
      groups.push(group.content);
      i = group.endIndex;
    }

    return {
      groups,
      endIndex: i
    };
  }

  function parseKeyValueBlock(content) {
    const result = {};
    const lines = content.split("\n");

    let currentKey = null;

    lines.forEach((rawLine) => {
      const line = rawLine.trim();

      if (!line) {
        return;
      }

      const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);

      if (match) {
        currentKey = match[1];

        let value = match[2].trim();
        value = value.replace(/,$/, "").trim();

        result[currentKey] = value;
      } else if (currentKey) {
        result[currentKey] += "\n" + line.replace(/,$/, "").trim();
      }
    });

    return result;
  }

  function parseSimpleList(value) {
    return value
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseTypedList(value) {
    return parseSimpleList(value).map((item) => {
      const parts = item.split(":");

      return {
        type: (parts[0] || "").trim(),
        label: (parts[1] || parts[0] || "").trim()
      };
    });
  }

  function normalizeBlock(command, groups) {
    if (command === "page" || command === "lesson") {
      return {
        type: command,
        data: parseKeyValueBlock(groups[0] || "")
      };
    }

    if (
      command === "section" ||
      command === "subsection" ||
      command === "subsubsection" ||
      command === "paragraph" ||
      command === "note" ||
      command === "tip" ||
      command === "warning" ||
      command === "equation"
    ) {
      return {
        type: command,
        content: groups[0] || ""
      };
    }

    if (
      command === "definition" ||
      command === "example" ||
      command === "exercise" ||
      command === "solution"
    ) {
      return {
        type: command,
        title: groups[0] || "",
        content: groups[1] || ""
      };
    }

    if (command === "code") {
      return {
        type: "code",
        language: groups[0] || "",
        content: groups[1] || ""
      };
    }

    if (command === "image") {
      return {
        type: "image",
        data: parseKeyValueBlock(groups[0] || "")
      };
    }

    if (command === "video") {
      return {
        type: "video",
        data: parseKeyValueBlock(groups[0] || "")
      };
    }

    if (command === "table") {
      const data = parseKeyValueBlock(groups[0] || "");

      return {
        type: "table",

        title: data.title || "",
        caption: data.caption || "",

        style: data.style || "default",
        align: data.align || "left",
        width: data.width || "full",

        columns: (data.columns || "")
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean),

        rows: parseSimpleList(data.rows || "").map((row) =>
          row.split("|").map((cell) => cell.trim())
        )
      };
    }

    if (command === "quiz") {
      const data = parseKeyValueBlock(groups[0] || "");

      return {
        type: "quiz",
        question: data.question || "",
        options: parseSimpleList(data.options || "").map((item) => {
          const parts = item.split(":");

          return {
            key: (parts[0] || "").trim(),
            text: parts.slice(1).join(":").trim()
          };
        }),
        answer: data.answer || "",
        feedback: data.feedback || ""
      };
    }

    if (command === "interactive2Dplane") {
      const data = parseKeyValueBlock(groups[0] || "");

      return {
        type: "interactive2Dplane",
        title: data.title || "2D Interactive Plane",
        instructions: data.instructions || "",
        width: Number(data.width || 900),
        height: Number(data.height || 500),
        grid: data.grid === "true",
        objects: parseTypedList(data.objects || "")
      };
    }

    return {
      type: "unknown",
      command,
      groups
    };
  }

  function parse(source) {
    const cleanSource = removeComments(source);
    const blocks = [];

    let i = 0;

    while (i < cleanSource.length) {
      const commandMatch = cleanSource.slice(i).match(/^\\([A-Za-z0-9_]+)/);

      if (!commandMatch) {
        i += 1;
        continue;
      }

      const command = commandMatch[1];
      i += commandMatch[0].length;

      const parsedGroups = readCommandGroups(cleanSource, i);
      i = parsedGroups.endIndex;

      blocks.push(normalizeBlock(command, parsedGroups.groups));
    }

    return blocks;
  }

  return {
    parse
  };
})();