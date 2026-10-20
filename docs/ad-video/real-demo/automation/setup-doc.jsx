// 데모용 새 문서: 흰 배경 + Color 레이어 + Line 레이어(꽃 선화)
app.preferences.rulerUnits = Units.PIXELS;
var W = 1200, H = 800;
var doc = app.documents.add(W, H, 72, "SHA Paint Demo", NewDocumentMode.RGB, DocumentFill.WHITE);
var colorLayer = doc.artLayers.add(); colorLayer.name = "Color";
var lineLayer = doc.artLayers.add(); lineLayer.name = "Line";

var ink = new SolidColor(); ink.rgb.red = 58; ink.rgb.green = 47; ink.rgb.blue = 42;

function ellipse(cx, cy, rx, ry, rotDeg) {
  var pts = [], n = 48, r = rotDeg * Math.PI / 180;
  for (var i = 0; i < n; i++) {
    var t = i / n * Math.PI * 2;
    var x = rx * Math.cos(t), y = ry * Math.sin(t);
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return pts;
}
function strokeShape(pts, w) {
  doc.selection.select(pts);
  doc.selection.stroke(ink, w, StrokeLocation.CENTER);
  doc.selection.deselect();
}

var cx = 600, cy = 360;
// 꽃잎 5장
for (var k = 0; k < 5; k++) {
  var a = -90 + k * 72;
  var ar = a * Math.PI / 180;
  strokeShape(ellipse(cx + 125 * Math.cos(ar), cy + 125 * Math.sin(ar), 115, 62, a), 6);
}
// 꽃 중심
strokeShape(ellipse(cx, cy, 52, 52, 0), 6);
// 줄기
strokeShape([[cx - 6, cy + 180], [cx + 6, cy + 180], [cx + 10, H - 20], [cx - 2, H - 20]], 5);
// 잎 2장
strokeShape(ellipse(cx - 110, cy + 330, 105, 40, -25), 6);
strokeShape(ellipse(cx + 115, cy + 290, 105, 40, 25), 6);

doc.activeLayer = colorLayer;
// 브러시 도구 + 크기 44px, 경도 100
app.currentTool = "paintbrushTool";
function cTID(s) { return charIDToTypeID(s); }
function sTID(s) { return stringIDToTypeID(s); }
var d = new ActionDescriptor(), r = new ActionReference();
r.putEnumerated(cTID("Brsh"), cTID("Ordn"), cTID("Trgt"));
d.putReference(cTID("null"), r);
var d2 = new ActionDescriptor();
d2.putUnitDouble(sTID("masterDiameter"), cTID("#Pxl"), 44);
d2.putUnitDouble(cTID("Hrdn"), cTID("#Prc"), 100);
d.putObject(cTID("T   "), cTID("Brsh"), d2);
executeAction(cTID("setd"), d, DialogModes.NO);
// 100% 보기
try { app.runMenuItem(sTID("actualPixels")); } catch (e) {}
"done";
