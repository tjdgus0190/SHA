# SendInput 기반 마우스 자동화 (멀티모니터 가상 데스크톱 좌표)
# 좌표는 "Photoshop 모니터 기준 로컬 좌표"(0~1919, 0~1079)로 받는다. 전역 x = 로컬 x + $MonX
$MonX = -1920
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Threading;
public class Inp {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  const uint MOVE=0x1, LDOWN=0x2, LUP=0x4, MDOWN=0x20, MUP=0x40, ABS=0x8000, VDESK=0x4000;
  public static double cx, cy;
  static void Send(uint flags, int x, int y) {
    int vl=GetSystemMetrics(76), vt=GetSystemMetrics(77), vw=GetSystemMetrics(78), vh=GetSystemMetrics(79);
    var i = new INPUT[1]; i[0].type = 0;
    i[0].mi.dx = (int)Math.Round((x - vl) * 65535.0 / (vw - 1));
    i[0].mi.dy = (int)Math.Round((y - vt) * 65535.0 / (vh - 1));
    i[0].mi.dwFlags = flags | MOVE | ABS | VDESK;
    if (SendInput(1, i, Marshal.SizeOf(typeof(INPUT))) == 0) throw new Exception("SendInput failed size=" + Marshal.SizeOf(typeof(INPUT)) + " err=" + Marshal.GetLastWin32Error());
  }
  public static void To(double x, double y) { cx = x; cy = y; Send(0, (int)x, (int)y); }
  // 사람처럼 부드럽게 이동 (ease-in-out)
  public static void Glide(double x, double y, int ms) {
    double sx = cx, sy = cy; int steps = Math.Max(1, ms / 8);
    for (int k = 1; k <= steps; k++) { double t = (double)k / steps; t = t < .5 ? 2*t*t : 1 - Math.Pow(-2*t + 2, 2) / 2;
      To(sx + (x - sx) * t, sy + (y - sy) * t); Thread.Sleep(8); }
  }
  public static void LDown() { Send(LDOWN, (int)cx, (int)cy); }
  public static void LUp() { Send(LUP, (int)cx, (int)cy); }
  public static void Middle() { Send(MDOWN, (int)cx, (int)cy); Thread.Sleep(40); Send(MUP, (int)cx, (int)cy); }
  public static void Click() { LDown(); Thread.Sleep(50); LUp(); }
}
"@
[Inp]::SetProcessDPIAware() | Out-Null
function G([double]$x) { return $x + $MonX }
function MoveTo([double]$x, [double]$y, [int]$ms = 400) { [Inp]::Glide((G $x), $y, $ms) }
function Jump([double]$x, [double]$y) { [Inp]::To((G $x), $y) }
function Middle { [Inp]::Middle() }
function Click { [Inp]::Click() }
function Wait([int]$ms) { Start-Sleep -Milliseconds $ms }
# 점 목록을 따라 누른 채로 그리기 (각 구간 ms)
function Stroke($pts, [int]$segMs = 60) {
  MoveTo $pts[0][0] $pts[0][1] 250
  [Inp]::LDown()
  for ($i = 1; $i -lt $pts.Count; $i++) { [Inp]::Glide((G $pts[$i][0]), $pts[$i][1], $segMs) }
  [Inp]::LUp()
}
# 백그라운드 프로세스는 포커스를 못 뺏으므로, 캔버스 밖 회색 작업영역을 실제로 클릭해서 활성화한다
function FocusPhotoshop { MoveTo 110 900 300; Click; Wait 400 }


