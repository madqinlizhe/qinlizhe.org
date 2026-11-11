import test from "node:test";
import assert from "node:assert/strict";
import { inlineMarkdown, markdownToHtml } from "./markdown.mjs";

test("small annotations retain inline formatting while other HTML stays escaped", () => {
  assert.equal(markdownToHtml("<small>Note: **context** & detail.</small>"),
    "<p><small>Note: <strong>context</strong> &amp; detail.</small></p>");
  assert.equal(inlineMarkdown('<small onclick="bad()">note</small>'),
    '&lt;small onclick=&quot;bad()&quot;&gt;note&lt;/small&gt;');
  assert.equal(inlineMarkdown("<small><script>bad()</script></small>"),
    "<small>&lt;script&gt;bad()&lt;/script&gt;</small>");
});
