Unicode true
!include MUI2.nsh
!include LogicLib.nsh
!include "${UTIL_INCLUDE}"
!addplugindir /x86-unicode "${PLUGIN_DIRECTORY}"
Name "DevPulse ${VERSION}"
OutFile "${OUTPUT}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "${ICON}"
!define MUI_ICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install DevPulse ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Setup will download DevPulse from its official GitHub release and verify the download. On the next screen you can choose the installation folder."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section
  InitPluginsDir
  DetailPrint "Downloading DevPulse ${VERSION} from GitHub Releases..."
  download:
  INetC::get /CAPTION "Download DevPulse" /USERAGENT "DevPulse Setup ${VERSION}" "${DOWNLOAD_URL}" "$PLUGINSDIR\DevPulse-package.exe" /END
  Pop $0
  StrCmp $0 "OK" verify
  StrCmp $0 "Cancelled" cancelled
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Download failed ($0). Check your connection and retry." IDRETRY download
  cancelled:
  SetErrorLevel 2
  Quit
  verify:
  DetailPrint "Verifying the SHA-512 checksum..."
  ${StdUtils.HashFile} $1 "SHA2-512" "$PLUGINSDIR\DevPulse-package.exe"
  StrCmp $1 "${CHECKSUM}" install
  MessageBox MB_ICONSTOP "The downloaded installer failed verification. Download the installer again from the official DevPulse release."
  SetErrorLevel 3
  Quit
  install:
  DetailPrint "Opening the verified installer..."
  HideWindow
  ClearErrors
  ExecWait '"$PLUGINSDIR\DevPulse-package.exe"' $2
  IfErrors executionFailed
  SetErrorLevel $2
  Quit
  executionFailed:
  MessageBox MB_ICONSTOP "The downloaded installer could not start."
  SetErrorLevel 4
SectionEnd
