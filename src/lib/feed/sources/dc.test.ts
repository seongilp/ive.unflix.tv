import { describe, expect, it } from "vitest";
import { normalizeDc } from "./dc";

// Minimal slice of a DC minor-gallery list table: one notice row (no data-no)
// and one real post row.
const html = `
<table class="gall_list"><tbody>
  <tr class="ub-content us-post" data-type="icon_notice">
    <td class="gall_num">공지</td>
    <td class="gall_tit ub-word"><a href="/notice">공지글</a></td>
  </tr>
  <tr class="ub-content us-post" data-no="12345" data-type="icon_txt">
    <td class="gall_num">12345</td>
    <td class="gall_tit ub-word"><a href="/mgallery/board/view/?id=123ive&no=12345">원영 직캠 모음</a></td>
    <td class="gall_writer ub-writer" data-nick="팬1"></td>
    <td class="gall_date" title="2026-06-17 12:34:56">06.17</td>
  </tr>
</tbody></table>`;

describe("normalizeDc", () => {
  it("extracts real post rows and skips notices", () => {
    const items = normalizeDc(html, "123ive");
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.id).toBe("dc:123ive:12345");
    expect(item.source).toBe("dc");
    expect(item.title).toBe("원영 직캠 모음");
    expect(item.author).toBe("팬1");
    expect(item.url).toBe("https://gall.dcinside.com/mgallery/board/view/?id=123ive&no=12345");
    expect(item.publishedAt).toBe(Date.parse("2026-06-17T12:34:56+09:00"));
  });

  it("tolerates surrounding whitespace in the gall_date title attr", () => {
    const padded = `
<table class="gall_list"><tbody>
  <tr class="ub-content us-post" data-no="67890" data-type="icon_txt">
    <td class="gall_num">67890</td>
    <td class="gall_tit ub-word"><a href="/mgallery/board/view/?id=123ive&no=67890">패딩된 날짜</a></td>
    <td class="gall_writer ub-writer" data-nick="팬2"></td>
    <td class="gall_date" title=" 2026-06-17 12:34:56 ">06.17</td>
  </tr>
</tbody></table>`;
    const [item] = normalizeDc(padded, "123ive");
    expect(item.publishedAt).toBe(Date.parse("2026-06-17T12:34:56+09:00"));
  });
});
