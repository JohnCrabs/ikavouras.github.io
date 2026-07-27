const TLXParser = (() => {
  function removeComments(source) {
    return String(source || "")
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
      while (i < source.length && /\s/.test(source[i])) {
        i += 1;
      }

      if (source[i] !== "{") {
        break;
      }

      const group = parseBracedGroup(source, i);

      if (!group) {
        break;
      }

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
    const lines = String(content || "").split("\n");

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
    return String(value || "")
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

  function parseCardsContent(content) {
    const items = [];
    let settingsContent = "";
    let i = 0;

    while (i < content.length) {
      const match = content.slice(i).match(/\\item\s*/);

      if (!match) {
        settingsContent += content.slice(i);
        break;
      }

      settingsContent += content.slice(i, i + match.index);
      i += match.index + match[0].length;

      while (i < content.length && /\s/.test(content[i])) {
        i += 1;
      }

      if (content[i] !== "{") {
        settingsContent += "\\item";
        continue;
      }

      const itemGroup = parseBracedGroup(content, i);

      if (!itemGroup) {
        break;
      }

      items.push(parseKeyValueBlock(itemGroup.content));
      i = itemGroup.endIndex;
    }

    return {
      settings: parseKeyValueBlock(settingsContent),
      items
    };
  }

  function parseCodeTabsContent(content) {
    const tabs = [];
    let i = 0;

    while (i < content.length) {
      const match = content.slice(i).match(/\\tab\s*/);

      if (!match) {
        break;
      }

      i += match.index + match[0].length;

      const parsedGroups = readCommandGroups(content, i);
      i = parsedGroups.endIndex;

      tabs.push({
        label: parsedGroups.groups[0] || "Code",
        language: parsedGroups.groups[1] || "",
        code: parsedGroups.groups[2] || ""
      });
    }

    return tabs;
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

  function normalizeBlock(command, groups) {
    const normalizedCommand = String(command || "").trim();

    if (normalizedCommand === "page" || normalizedCommand === "lesson") {
      return {
        type: normalizedCommand,
        data: parseKeyValueBlock(groups[0] || "")
      };
    }

    if (
      normalizedCommand === "section" ||
      normalizedCommand === "subsection" ||
      normalizedCommand === "subsubsection" ||
      normalizedCommand === "paragraph" ||
      normalizedCommand === "note" ||
      normalizedCommand === "tip" ||
      normalizedCommand === "warning" ||
      normalizedCommand === "equation"
    ) {
      return {
        type: normalizedCommand,
        content: groups[0] || ""
      };
    }

    if (
      normalizedCommand === "definition" ||
      normalizedCommand === "example" ||
      normalizedCommand === "exercise" ||
      normalizedCommand === "solution"
    ) {
      return {
        type: normalizedCommand,
        title: groups[0] || "",
        content: groups[1] || ""
      };
    }

    if (normalizedCommand === "code") {
      return {
        type: "code",
        language: groups[0] || "",
        content: groups[1] || ""
      };
    }

    if (normalizedCommand === "codetabs") {
      return {
        type: "codetabs",
        title: groups[0] || "Κώδικας",
        tabs: parseCodeTabsContent(groups[1] || "")
      };
    }

    if (normalizedCommand === "image") {
      return {
        type: "image",
        data: parseKeyValueBlock(groups[0] || "")
      };
    }

    if (normalizedCommand === "video") {
      return {
        type: "video",
        data: parseKeyValueBlock(groups[0] || "")
      };
    }

    if (normalizedCommand === "table") {
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

    if (normalizedCommand === "quiz") {
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

    if (normalizedCommand === "interactive2Dplane") {
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

    if (normalizedCommand === "plotplayground") {
      const data = parseKeyValueBlock(groups[0] || "");

      return {
        type: "plotplayground",
        title: data.title || "Διαδραστικό γράφημα συναρτήσεων",
        functions: data.functions || "x^2",
        xMin: Number(data.xMin || -10),
        xMax: Number(data.xMax || 10),
        yMin: Number(data.yMin || -10),
        yMax: Number(data.yMax || 10)
      };
    }

    if (normalizedCommand === "cards") {
      const rawContent = groups[0] || "";
      const cardsData = parseCardsContent(rawContent);

      return {
        type: "cards",

        columns: Number(cardsData.settings.columns || 3),
        ratio: cardsData.settings.ratio || "1:1",
        size: cardsData.settings.size || "normal",

        settings: cardsData.settings,

        items: cardsData.items.map((item) => {
          return {
            title: item.title || "",
            description: item.description || "",
            image: item.image || "",
            url: item.url || "#",
            tag: item.tag || item.title || ""
          };
        })
      };
    }

    if (normalizedCommand === "navlinks") {
      const data = parseKeyValueBlock(groups[0] || "");

      return {
        type: "navlinks",
        previousLabel: data.previousLabel || "",
        previousUrl: data.previousUrl || "#",
        nextLabel: data.nextLabel || "",
        nextUrl: data.nextUrl || "#"
      };
    }

    return {
      type: "unknown",
      command: normalizedCommand,
      groups
    };
  }

  return {
    parse
  };
})();