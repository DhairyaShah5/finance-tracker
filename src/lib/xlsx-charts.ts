import "server-only";
import JSZip from "jszip";

// exceljs can't create native charts, so we build one exceljs workbook (with the
// chart *data* in cells) then splice OOXML chart parts into its zip. The charts
// reference the cells, so they're real, interactive, editable Excel charts.

const EMU_PER_PX = 9525;
const CHART = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const MAIN = "http://schemas.openxmlformats.org/drawingml/2006/main";
const RELNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SSDRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const PKGREL = "http://schemas.openxmlformats.org/package/2006/relationships";

export interface ChartSeries {
  titleRef: string; // e.g. 'Chart data'!$B$1
  catRef: string; // 'Chart data'!$A$2:$A$13
  valRef: string; // 'Chart data'!$B$2:$B$13
  color?: string; // hex, no '#'
}
export interface ChartSpec {
  kind: "line" | "col" | "colStacked" | "bar" | "doughnut";
  title: string;
  series: ChartSeries[];
  pointColors?: string[]; // per data-point fill (diverging bars, pie slices, ...)
  showVal?: boolean;
  showPercent?: boolean;
  anchorCol: number; // 0-based
  anchorRow: number; // 0-based
  widthPx?: number;
  heightPx?: number;
}

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const strRef = (f: string) => `<c:strRef><c:f>${esc(f)}</c:f></c:strRef>`;
const numRef = (f: string) => `<c:numRef><c:f>${esc(f)}</c:f></c:numRef>`;
const fill = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;

function dLbls(showVal: boolean, showPercent: boolean) {
  return (
    `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${showVal ? 1 : 0}"/>` +
    `<c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${showPercent ? 1 : 0}"/>` +
    `<c:showBubbleSize val="0"/></c:dLbls>`
  );
}

function dPts(colors: string[] | undefined, pie: boolean) {
  if (!colors) return "";
  return colors
    .map(
      (hex, i) =>
        `<c:dPt><c:idx val="${i}"/>` +
        (pie ? "" : `<c:invertIfNegative val="0"/>`) +
        `<c:bubble3D val="0"/><c:spPr>${fill(hex)}<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`,
    )
    .join("");
}

function axes(catPos: "b" | "l", valPos: "b" | "l") {
  return (
    `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="${catPos}"/><c:crossAx val="222"/></c:catAx>` +
    `<c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="${valPos}"/><c:majorGridlines/>` +
    `<c:numFmt formatCode="&quot;$&quot;#,##0" sourceLinked="0"/><c:crossAx val="111"/></c:valAx>`
  );
}

function lineSer(s: ChartSeries, i: number, showVal: boolean) {
  const color = s.color ?? "4F46E5";
  return (
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx>${strRef(s.titleRef)}</c:tx>` +
    `<c:spPr><a:ln w="28575">${fill(color)}</a:ln></c:spPr>` +
    `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill(color)}</c:spPr></c:marker>` +
    (showVal ? dLbls(true, false) : "") +
    `<c:cat>${strRef(s.catRef)}</c:cat><c:val>${numRef(s.valRef)}</c:val><c:smooth val="0"/></c:ser>`
  );
}

function barSer(s: ChartSeries, i: number, spec: ChartSpec) {
  const hasPts = !!spec.pointColors && spec.series.length === 1;
  const spPr = s.color ? `<c:spPr>${fill(s.color)}</c:spPr>` : "";
  return (
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx>${strRef(s.titleRef)}</c:tx>` +
    spPr +
    `<c:invertIfNegative val="0"/>` +
    (hasPts ? dPts(spec.pointColors, false) : "") +
    (spec.showVal || spec.showPercent ? dLbls(!!spec.showVal, !!spec.showPercent) : "") +
    `<c:cat>${strRef(s.catRef)}</c:cat><c:val>${numRef(s.valRef)}</c:val></c:ser>`
  );
}

function pieSer(s: ChartSeries, spec: ChartSpec) {
  return (
    `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx>${strRef(s.titleRef)}</c:tx>` +
    dPts(spec.pointColors, true) +
    (spec.showPercent || spec.showVal ? dLbls(!!spec.showVal, !!spec.showPercent) : "") +
    `<c:cat>${strRef(s.catRef)}</c:cat><c:val>${numRef(s.valRef)}</c:val></c:ser>`
  );
}

function legend(pos: "r" | "b") {
  return `<c:legend><c:legendPos val="${pos}"/><c:overlay val="0"/></c:legend>`;
}

function chartXml(spec: ChartSpec): string {
  let plot = "";
  let leg = "";
  if (spec.kind === "line") {
    plot =
      `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>` +
      spec.series.map((s, i) => lineSer(s, i, !!spec.showVal)).join("") +
      `<c:marker val="1"/><c:axId val="111"/><c:axId val="222"/></c:lineChart>` +
      axes("b", "l");
    if (spec.series.length > 1) leg = legend("b");
  } else if (spec.kind === "col" || spec.kind === "colStacked") {
    const stacked = spec.kind === "colStacked";
    plot =
      `<c:barChart><c:barDir val="col"/><c:grouping val="${stacked ? "stacked" : "clustered"}"/><c:varyColors val="0"/>` +
      spec.series.map((s, i) => barSer(s, i, spec)).join("") +
      `<c:gapWidth val="120"/>` +
      (stacked ? `<c:overlap val="100"/>` : "") +
      `<c:axId val="111"/><c:axId val="222"/></c:barChart>` +
      axes("b", "l");
    if (stacked || spec.series.length > 1) leg = legend("b");
  } else if (spec.kind === "bar") {
    plot =
      `<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
      spec.series.map((s, i) => barSer(s, i, spec)).join("") +
      `<c:gapWidth val="80"/><c:axId val="111"/><c:axId val="222"/></c:barChart>` +
      axes("l", "b");
  } else {
    // doughnut
    plot =
      `<c:doughnutChart><c:varyColors val="1"/>` +
      pieSer(spec.series[0], spec) +
      `<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
    leg = legend("r");
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="${CHART}" xmlns:a="${MAIN}" xmlns:r="${RELNS}"><c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr b="1" sz="1200"/></a:pPr>` +
    `<a:r><a:rPr lang="en-US" b="1" sz="1200"/><a:t>${esc(spec.title)}</a:t></a:r></a:p></c:rich></c:tx>` +
    `<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/>${plot}</c:plotArea>${leg}` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`
  );
}

function drawingXml(specs: ChartSpec[]): string {
  const anchors = specs
    .map((s, i) => {
      const cx = (s.widthPx ?? 720) * EMU_PER_PX;
      const cy = (s.heightPx ?? 360) * EMU_PER_PX;
      return (
        `<xdr:oneCellAnchor>` +
        `<xdr:from><xdr:col>${s.anchorCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${s.anchorRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:ext cx="${cx}" cy="${cy}"/>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
        `<a:graphic><a:graphicData uri="${CHART}"><c:chart xmlns:c="${CHART}" xmlns:r="${RELNS}" r:id="rId${i + 1}"/></a:graphicData></a:graphic>` +
        `</xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`
      );
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${SSDRAW}" xmlns:a="${MAIN}">${anchors}</xdr:wsDr>`;
}

function drawingRels(n: number): string {
  const rels = Array.from({ length: n }, (_, i) => `<Relationship Id="rId${i + 1}" Type="${CHART}" Target="../charts/chart${i + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKGREL}">${rels}</Relationships>`;
}

/** Resolve which xl/worksheets/sheetN.xml backs a sheet by its tab name. */
function sheetPathFor(workbookXml: string, workbookRels: string, name: string): string | null {
  const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => m[0]);
  let rid: string | null = null;
  for (const tag of sheets) {
    const nm = tag.match(/name="([^"]+)"/)?.[1];
    const id = tag.match(/r:id="([^"]+)"/)?.[1];
    if (nm === name && id) { rid = id; break; }
  }
  if (!rid) return null;
  const rels = [...workbookRels.matchAll(/<Relationship\b[^>]*\/>/g)].map((m) => m[0]);
  for (const tag of rels) {
    const id = tag.match(/Id="([^"]+)"/)?.[1];
    if (id !== rid) continue;
    let target = tag.match(/Target="([^"]+)"/)?.[1] ?? "";
    target = target.replace(/^\/?xl\//, "").replace(/^\//, "");
    return `xl/${target}`;
  }
  return null;
}

/** Inject native charts (drawn on `chartSheetName`) into an exceljs-produced xlsx. */
export async function injectCharts(xlsx: Buffer, chartSheetName: string, specs: ChartSpec[]): Promise<Buffer> {
  if (!specs.length) return xlsx;
  const zip = await JSZip.loadAsync(xlsx);

  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  const workbookRels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const sheetPath = sheetPathFor(workbookXml, workbookRels, chartSheetName);
  if (!sheetPath || !zip.file(sheetPath)) throw new Error(`Charts sheet "${chartSheetName}" not found for injection`);

  // Chart + drawing parts.
  specs.forEach((spec, i) => zip.file(`xl/charts/chart${i + 1}.xml`, chartXml(spec)));
  zip.file("xl/drawings/drawing1.xml", drawingXml(specs));
  zip.file("xl/drawings/_rels/drawing1.xml.rels", drawingRels(specs.length));

  // Link the sheet to the drawing.
  const sheetRelsPath = sheetPath.replace(/worksheets\/([^/]+)$/, "worksheets/_rels/$1.rels");
  const existingRels = zip.file(sheetRelsPath);
  let relsXml = existingRels
    ? await existingRels.async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKGREL}"></Relationships>`;
  const usedIds = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const drawingRelId = `rId${(usedIds.length ? Math.max(...usedIds) : 0) + 1}`;
  relsXml = relsXml.replace(
    "</Relationships>",
    `<Relationship Id="${drawingRelId}" Type="${RELNS}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
  );
  zip.file(sheetRelsPath, relsXml);

  // Add <drawing r:id> to the sheet (ensure xmlns:r is declared on <worksheet>).
  let sheetXml = await zip.file(sheetPath)!.async("string");
  if (!/<worksheet\b[^>]*xmlns:r=/.test(sheetXml)) {
    sheetXml = sheetXml.replace(/<worksheet\b/, `<worksheet xmlns:r="${RELNS}"`);
  }
  const drawingTag = `<drawing r:id="${drawingRelId}"/>`;
  const anchorEl = sheetXml.match(/<(tableParts|extLst)\b/);
  if (anchorEl) sheetXml = sheetXml.replace(anchorEl[0], `${drawingTag}${anchorEl[0]}`);
  else sheetXml = sheetXml.replace("</worksheet>", `${drawingTag}</worksheet>`);
  zip.file(sheetPath, sheetXml);

  // Register the new parts in [Content_Types].xml.
  let ct = await zip.file("[Content_Types].xml")!.async("string");
  const overrides =
    specs.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("") +
    `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
  ct = ct.replace("</Types>", `${overrides}</Types>`);
  zip.file("[Content_Types].xml", ct);

  return zip.generateAsync({ type: "nodebuffer" });
}
