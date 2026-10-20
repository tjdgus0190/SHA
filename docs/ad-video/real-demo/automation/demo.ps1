# SHA Paint 실사용 데모 자동 촬영
$d = "C:\Users\user\AppData\Local\Temp\claude\d--SHA-PAINT\83bf41fb-8a92-4c7a-9d71-b09d457739c0\scratchpad\demo"
. "$d\input.ps1"
$ff = "C:\Users\user\AppData\Local\Temp\claude\d--SHA-PAINT\83bf41fb-8a92-4c7a-9d71-b09d457739c0\scratchpad\ad-render\node_modules\ffmpeg-static\ffmpeg.exe"

$OX = 209; $OY = 156          # 캔버스(문서 0,0)의 모니터 로컬 좌표 (100% 보기)
$FC = @(166, 169)             # 커서 -> 팝업 필드 중심 오프셋
$HIST0 = @(75, 331); $HSTEP = 23   # 커서 -> 첫 히스토리 스와치 오프셋
$CLOSE = @(294, 38)           # 커서 -> 팝업 닫기(x) 버튼 오프셋

# 필드 중심 기준 색 위치(px): 모두 L*72
$COL = @{
  pink     = @(34, 0);   lavender = @(18, -31); peach = @(25, 36)
  leaf     = @(-27, 38); yellow   = @(4, 47)
}

function DocPt($x, $y) { return @(($x + $OX), ($y + $OY)) }

function OpenPopupAt($x, $y) { MoveTo $x $y 450; Wait 150; Middle; Wait 650; $script:cur = @($x, $y) }
$LOG = "$env:APPDATA\luminance-overlay-app\sha-paint-log.txt"
function PopupOpenNow {
  $last = Get-Content $LOG -Tail 40 -Encoding UTF8 | Where-Object { $_ -match "팝업 (열림|닫힘)" } | Select-Object -Last 1
  return ($last -match "팝업 열림")
}
function ClosePopup {
  Middle; Wait 400
  if (PopupOpenNow) { MoveTo ($cur[0] + $CLOSE[0]) ($cur[1] + $CLOSE[1]) 250; Click; Wait 350 }
}

# 필드에서 현재 색 위치를 누르고, 필드 중심을 도는 호를 따라 목표 색까지 드래그
function PickColor($from, $to) {
  $c = @(($cur[0] + $FC[0]), ($cur[1] + $FC[1]))
  $a0 = [Math]::Atan2($from[1], $from[0]); $a1 = [Math]::Atan2($to[1], $to[0])
  $r0 = [Math]::Sqrt($from[0]*$from[0] + $from[1]*$from[1]); $r1 = [Math]::Sqrt($to[0]*$to[0] + $to[1]*$to[1])
  $da = $a1 - $a0; if ($da -gt [Math]::PI) { $da -= 2*[Math]::PI }; if ($da -lt -[Math]::PI) { $da += 2*[Math]::PI }
  MoveTo ($c[0] + $from[0]) ($c[1] + $from[1]) 350; Wait 150
  [Inp]::LDown()
  $n = 14
  for ($i = 1; $i -le $n; $i++) {
    $t = $i / $n; $a = $a0 + $da * $t; $r = $r0 + ($r1 - $r0) * $t + [Math]::Sin($t * [Math]::PI) * 10
    [Inp]::Glide((G ($c[0] + $r * [Math]::Cos($a))), ($c[1] + $r * [Math]::Sin($a)), 55)
  }
  Wait 120; [Inp]::LUp(); Wait 500
}

function PickHistory($idx) {
  MoveTo ($cur[0] + $HIST0[0] + $HSTEP * $idx) ($cur[1] + $HIST0[1]) 450; Wait 200; Click; Wait 500
}

# 회전 타원 안을 지그재그로 칠하기 (문서 좌표)
function FillEllipse([double]$cx, [double]$cy, [double]$rx, [double]$ry, [double]$rotDeg, [int]$rows = 12, [int]$segMs = 55) {
  $r = $rotDeg * [Math]::PI / 180; $pts = @()
  for ($k = 0; $k -le $rows; $k++) {
    $u = -0.78 + 1.56 * $k / $rows
    $half = [Math]::Max(0, ($ry - 16) * [Math]::Sqrt(1 - $u * $u))
    $v = if ($k % 2 -eq 0) { -$half } else { $half }
    $x = $rx * $u
    $px = $cx + $x * [Math]::Cos($r) - $v * [Math]::Sin($r)
    $py = $cy + $x * [Math]::Sin($r) + $v * [Math]::Cos($r)
    $pts += , (DocPt $px $py)
  }
  Stroke $pts $segMs
}

function Petal($k) {
  $a = -90 + $k * 72; $ar = $a * [Math]::PI / 180
  FillEllipse (600 + 125 * [Math]::Cos($ar)) (360 + 125 * [Math]::Sin($ar)) 115 62 $a 12 55
}

function RunJS($js) { $script:ps.DoJavaScript($js) | Out-Null }
$script:ps = New-Object -ComObject Photoshop.Application

# ---------------- 녹화 시작 ----------------
$out = "$d\raw.mkv"
Remove-Item $out -ErrorAction SilentlyContinue
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $ff
$psi.Arguments = "-hide_banner -loglevel error -y -f lavfi -i ddagrab=output_idx=1:framerate=30:draw_mouse=1 -vf hwdownload,format=bgra,format=yuv420p -c:v libx264 -preset ultrafast -crf 16 `"$out`""
$psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.CreateNoWindow = $true
$rec = [System.Diagnostics.Process]::Start($psi)
$t0 = Get-Date
function Mark($name) { "{0,6:N2}s {1}" -f ((Get-Date) - $t0).TotalSeconds, $name | Add-Content "$d\marks.txt" -Encoding UTF8 }
Remove-Item "$d\marks.txt" -ErrorAction SilentlyContinue
Wait 1500

# 1) 위쪽 꽃잎: 핑크
Mark "open1"
OpenPopupAt 700 210
PickColor $COL.pink $COL.pink
Mark "close1"; ClosePopup
Mark "paint1"; Petal 0

# 2) 오른쪽 위 꽃잎: 라벤더 (같은 밝기에서 색상만 돌림)
Mark "open2"
OpenPopupAt 1000 200
PickColor $COL.pink $COL.lavender
ClosePopup
Mark "paint2"; Petal 1

# 3) 오른쪽 아래 꽃잎: 피치
Mark "open3"
OpenPopupAt 960 420
PickColor $COL.lavender $COL.peach
ClosePopup
Mark "paint3"; Petal 2

# 4) 왼쪽 아래 꽃잎: 히스토리에서 핑크 다시 (히스토리 순서: 피치, 라벤더, 핑크)
Mark "open4"
OpenPopupAt 560 420
PickHistory 2
ClosePopup
Mark "paint4"; Petal 3

# 5) 왼쪽 위 꽃잎: 히스토리에서 라벤더 (순서: 핑크, 피치, 라벤더)
Mark "open5"
OpenPopupAt 520 260
PickHistory 2
ClosePopup
Mark "paint5"; Petal 4

# 6) 꽃 중심: 노랑
Mark "open6"
OpenPopupAt 640 330
PickColor $COL.pink $COL.yellow
ClosePopup
Mark "paint6"; FillEllipse 600 360 46 46 0 6 60

# 7) 잎/줄기: 초록
Mark "open7"
OpenPopupAt 700 560
PickColor $COL.yellow $COL.leaf
ClosePopup
Mark "paint7"
FillEllipse 490 690 105 40 -25 10 50
FillEllipse 715 650 105 40 25 10 50
Stroke @((DocPt 600 545), (DocPt 602 640), (DocPt 604 770)) 260

# 8) 증명: Lab 명도(L) 채널만 보기 -> 꽃잎이 전부 같은 회색
MoveTo 1500 980 500
Wait 800
Mark "proof"
RunJS "var d=app.activeDocument; d.changeMode(ChangeMode.LAB); d.activeChannels=[d.channels[0]];"
Wait 4500
Mark "proofEnd"
RunJS "var d=app.activeDocument; d.activeChannels=d.componentChannels;"
Wait 2000
Mark "end"

$rec.StandardInput.Write("q"); $rec.StandardInput.Flush()
if (-not $rec.WaitForExit(15000)) { Stop-Process -Id $rec.Id }
"recorded: $out"
Get-Content "$d\marks.txt"


