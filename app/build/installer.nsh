; SHA Paint 인스톨러 확장 (electron-builder nsis.include)
; 설치 마법사에 "라이선스 키 입력" 페이지를 추가한다. 입력한 키는
; %APPDATA%\luminance-overlay-app\license-key.txt 에 저장되고, 앱이 처음
; 실행될 때 licensing.js가 Gumroad로 확인한다.
; 재설치/업데이트 때는 기존 키 파일이 있으면 미리 채워둔다.
; ※ 이 파일은 UTF-8 BOM으로 저장해야 한글이 깨지지 않는다.
; ※ 이 파일이 include되는 시점엔 MUI 매크로(MUI_HEADER_TEXT 등)가 아직 없다.

; 언인스톨러 빌드 패스에서는 이 페이지/함수를 아예 넣지 않는다
; (참조되지 않는 함수 경고가 빌드 오류로 처리됨).
!ifndef BUILD_UNINSTALLER

!include nsDialogs.nsh
!include LogicLib.nsh

!define SHA_LICENSE_DIR "$APPDATA\luminance-overlay-app"
!define SHA_LICENSE_FILE "$APPDATA\luminance-overlay-app\license-key.txt"
; app/licensing.js의 GUMROAD_PRODUCT_ID와 반드시 같아야 한다(verify.js가 검사).
!define SHA_GUMROAD_PRODUCT_ID "Z-z4Harnz0sMKG_7200QXw=="

; 화면 문구(한국어/영어). 설치 프로그램 언어가 한국어(1042)면 한국어, 그 외엔 영어.
; LangString은 이 파일이 include되는 시점에 언어가 아직 정의되지 않아 쓸 수 없어서
; .onGUIInit 대신 페이지 함수 안에서 $LANGUAGE로 골라 변수에 담는다.
Var ShaT1
Var ShaT2
Var ShaTShort
Var ShaTChecking
Var ShaTRefunded
Var ShaTInvalid
Var ShaTNetErr

Function ShaLicenseStrings
  ${If} $LANGUAGE == 1042
    StrCpy $ShaT1 "구매 확인 메일에 있는 SHA Paint 라이선스 키를 입력하세요.$\r$\n(예: XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX)"
    StrCpy $ShaT2 "다음을 누르면 키를 인터넷으로 확인합니다.$\r$\n키를 잃어버리셨다면 구매하신 스토어의 구매 내역에서 다시 확인할 수 있습니다."
    StrCpy $ShaTShort "라이선스 키를 정확히 입력해 주세요."
    StrCpy $ShaTChecking "라이선스 키를 확인하는 중..."
    StrCpy $ShaTRefunded "환불 또는 결제 취소된 라이선스 키입니다."
    StrCpy $ShaTInvalid "유효하지 않은 라이선스 키입니다.$\r$\n구매 확인 메일의 키를 그대로 붙여넣어 주세요."
    StrCpy $ShaTNetErr "인터넷 연결 문제로 라이선스 키를 확인하지 못했습니다.$\r$\n계속 설치할까요? (프로그램을 처음 실행할 때 다시 확인합니다)"
  ${Else}
    StrCpy $ShaT1 "Enter the SHA Paint license key from your purchase confirmation email.$\r$\n(e.g. XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX)"
    StrCpy $ShaT2 "When you click Next, the key is checked online.$\r$\nIf you lost your key, you can find it again in your purchase history on the store."
    StrCpy $ShaTShort "Please enter the full license key."
    StrCpy $ShaTChecking "Checking your license key..."
    StrCpy $ShaTRefunded "This license key was refunded or its payment was canceled."
    StrCpy $ShaTInvalid "This license key isn't valid.$\r$\nPlease paste the key exactly as it appears in your purchase email."
    StrCpy $ShaTNetErr "Couldn't check the license key because of an internet connection problem.$\r$\nContinue installing? (It will be checked again when you first run the app.)"
  ${EndIf}
FunctionEnd

Var ShaLicDialog
Var ShaLicText
Var ShaLicKey

!macro customPageAfterChangeDir
  Page custom ShaLicensePageCreate ShaLicensePageLeave
!macroend

Function ShaLicensePageCreate
  Call ShaLicenseStrings
  ${If} $ShaLicKey == ""
    ${If} ${FileExists} "${SHA_LICENSE_FILE}"
      FileOpen $0 "${SHA_LICENSE_FILE}" r
      FileRead $0 $ShaLicKey
      FileClose $0
    ${EndIf}
  ${EndIf}

  nsDialogs::Create 1018
  Pop $ShaLicDialog
  ${If} $ShaLicDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "$ShaT1"
  Pop $0
  ${NSD_CreateText} 0 28u 100% 14u "$ShaLicKey"
  Pop $ShaLicText
  ${NSD_CreateLabel} 0 52u 100% 40u "$ShaT2"
  Pop $0

  ${NSD_SetFocus} $ShaLicText
  nsDialogs::Show
FunctionEnd

Function ShaLicensePageLeave
  ${NSD_GetText} $ShaLicText $ShaLicKey
  StrLen $0 $ShaLicKey
  ${If} $0 < 8
    MessageBox MB_ICONEXCLAMATION|MB_OK "$ShaTShort"
    Abort
  ${EndIf}

  ; 설치 단계에서 바로 Gumroad에 키를 확인한다(사용 횟수는 올리지 않음 —
  ; 활성화 카운트는 앱 첫 실행 때 licensing.js가 올린다).
  ; 키는 명령 문자열에 끼워넣지 않고 환경 변수로 넘긴다(입력값이 명령으로
  ; 해석되는 일 방지). 결과: OK / INVALID / REFUNDED / NETERR
  System::Call 'Kernel32::SetEnvironmentVariable(t "SHA_LIC_KEY", t "$ShaLicKey")'
  Banner::show /NOUNLOAD "$ShaTChecking"
  nsExec::ExecToStack `"powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$ProgressPreference='SilentlyContinue';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;try{$$r=Invoke-RestMethod -Method Post -Uri 'https://api.gumroad.com/v2/licenses/verify' -Body @{product_id='${SHA_GUMROAD_PRODUCT_ID}';license_key=$$env:SHA_LIC_KEY.Trim();increment_uses_count='false'} -TimeoutSec 15;if($$r.success){if($$r.purchase.refunded -or $$r.purchase.chargebacked -or $$r.purchase.disputed){'REFUNDED'}else{'OK'}}else{'INVALID'}}catch{$$s=0;if($$_.Exception.Response){$$s=[int]$$_.Exception.Response.StatusCode};if($$s -ge 400 -and $$s -lt 500){'INVALID'}else{'NETERR'}}"`
  Pop $0
  Pop $1
  Banner::destroy
  StrCpy $2 $1 2

  ${If} $2 == "OK"
    Return
  ${ElseIf} $2 == "RE"
    MessageBox MB_ICONEXCLAMATION|MB_OK "$ShaTRefunded"
    Abort
  ${ElseIf} $2 == "IN"
    MessageBox MB_ICONEXCLAMATION|MB_OK "$ShaTInvalid"
    Abort
  ${Else}
    MessageBox MB_ICONQUESTION|MB_YESNO "$ShaTNetErr" IDYES +2
    Abort
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $ShaLicKey != ""
    CreateDirectory "${SHA_LICENSE_DIR}"
    FileOpen $0 "${SHA_LICENSE_FILE}" w
    FileWrite $0 $ShaLicKey
    FileClose $0
  ${EndIf}
!macroend

!endif ; BUILD_UNINSTALLER
