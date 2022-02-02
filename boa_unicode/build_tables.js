#!/usr/bin/env node
/**
 * This file is used to generate the Rust source code with tables for Unicode properties and classes.
 *
 * This script downloads the content of `PropList.txt` from the remote server, parses the file, extracts
 * the target properties, prepares the char tables, and then writes to the output Rust file. It also
 * formats the output file with the command `rustfmt`. Please make sure `rustfmt` is available in the environment.
 *
 * Update and run this script when {@link https://unicode.org/reports/tr44/|Unicode® Standard Annex #44} is updated, and
 * always check the latest standard meets the {@link https://tc39.es/ecma262/#sec-names-and-keywords|spec of ECMAScript}.
 *
 * Run this script with command `node ./build_tables.js` or `npm run build-tables`.
 *
 * Version: Unicode 14.0.0
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const child_process = require("child_process");

/**
 * The URL to download the content of `PropList.txt` through HTTP Get.
 *
 * Please make sure the content follows the UCD file format defined in
 * {@link http://unicode.org/reports/tr44/#UCD_Files|UAX#44}.
 *
 * @constant {string}
 */
const PROPLIST_TXT_URL =
  "https://www.unicode.org/Public/14.0.0/ucd/PropList.txt";

/**
 * The target properties to process given in tuples. The first element is the property to search for.
 * The second element is the table variable name in the output Rust file.
 *
 * @constant {[string, string][]}
 */
const TARGET_PROPERTIES = [
  ["Pattern_Syntax", "PATTERN_SYNTAX"],
  ["Other_ID_Continue", "OTHER_ID_CONTINUE"],
  ["Other_ID_Start", "OTHER_ID_START"],
  ["Pattern_White_Space", "PATTERN_WHITE_SPACE"],
];

/**
 * The path of output Rust file.
 *
 * @constant {string}
 */
const OUTPUT_FILE = path.join(__dirname, "./src/tables.rs");

/**
 * The doc comment to add to the beginning of output Rust file.
 *
 * @constant {string}
 */
const OUTPUT_FILE_DOC_COMMENT = `
//! This module implements the unicode lookup tables for identifier and pattern syntax.
//! Version: Unicode 14.0.0
//!
//! This file is generated by \`boa_unicode/build_tables.js\`. Please do not modify it directly.
//!
//! More information:
//!  - [Unicode® Standard Annex #44][uax44]
//!
//! [uax44]: http://unicode.org/reports/tr44
`.trim();

https
  .get(PROPLIST_TXT_URL, (res) => {
    let text = "";

    res.on("data", (chunk) => {
      text += chunk;
    });

    res.on("end", () => {
      buildRustFile(text);
    });
  })
  .on("error", (err) => {
    console.log(`Failed to get 'PropList.txt': ${err.message}`);
  })
  .end();

function buildRustFile(propListText) {
  const dataRegex =
    /(^|\n)(?<codePointStart>[0-9A-F]+)(\.\.(?<codePointEnd>[0-9A-F]+))?\s*;\s*(?<property>[^\s]+)/gi;
  const data = [...propListText.matchAll(dataRegex)].map(
    (match) => match.groups
  );

  const rustVariables = TARGET_PROPERTIES.map(
    ([propertyName, rustTableName]) => {
      const codePoints = data
        .filter(({ property }) => property === propertyName)
        .map(({ codePointStart, codePointEnd }) => [
          codePointStart,
          codePointEnd ?? codePointStart,
        ])
        .map(([codePointStart, codePointEnd]) => [
          parseInt(codePointStart, 16),
          parseInt(codePointEnd, 16),
        ])
        .reduce((codePoints, [codePointStart, codePointEnd]) => {
          for (let cp = codePointStart; cp <= codePointEnd; cp++) {
            codePoints.push(cp);
          }
          return codePoints;
        }, []);

      codePoints.sort((a, b) => a - b);
      const rustTable = `&[${codePoints
        .map((cp) => `'\\u{${cp.toString(16).padStart(4, "0").toUpperCase()}}'`)
        .join(",")}]`;
      const rustVariable = `pub(crate) static ${rustTableName}: &[char] = ${rustTable};`;

      console.log(`${propertyName}: ${codePoints.length} code points`);
      return rustVariable;
    }
  );

  const rustFile = `${OUTPUT_FILE_DOC_COMMENT}\n\n${rustVariables.join(
    "\n\n"
  )}`;

  console.log("Writing output file...");
  fs.writeFileSync(OUTPUT_FILE, rustFile);

  console.log("Running rustfmt...");
  child_process.execSync(`rustfmt ${OUTPUT_FILE}`);
}
