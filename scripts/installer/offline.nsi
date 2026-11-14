Unicode true
!include MUI2.nsh
!include LogicLib.nsh
!ifdef SIGN_COMMAND
  !uninstfinalize '${SIGN_COMMAND} "%1"'
!endif
Name "DevPulse ${VERSION}"
OutFile "${OFFLINE_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\DevPulse"
InstallDirRegKey HKCU "Software\DevPulse" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
Icon "${ICON}"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\app\DevPulse.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Function .onVerifyInstDir
  ; The payload owns its app subfolder; never claim an existing unrelated tree.
  IfFileExists "$INSTDIR\app\*.*" 0 done
  IfFileExists "$INSTDIR\app\.devpulse-install" done
  Abort
  done:
FunctionEnd
Section "DevPulse"
  SetShellVarContext current
  SetOutPath "$INSTDIR\app"
  File /r "${APP_DIR}\*"
  FileOpen $0 "$INSTDIR\app\.devpulse-install" w
  FileWrite $0 "DevPulse ${VERSION}"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall DevPulse.exe"
  CreateShortCut "$SMPROGRAMS\DevPulse.lnk" "$INSTDIR\app\DevPulse.exe"
  CreateShortCut "$DESKTOP\DevPulse.lnk" "$INSTDIR\app\DevPulse.exe"
  WriteRegStr HKCU "Software\DevPulse" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevPulse" "DisplayName" "DevPulse"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevPulse" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevPulse" "DisplayIcon" "$INSTDIR\app\DevPulse.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevPulse" "UninstallString" '"$INSTDIR\Uninstall DevPulse.exe"'
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  IfFileExists "$INSTDIR\app\.devpulse-install" 0 end
  ; Remove only files included in this release, leaving user additions and profiles.
  !include "${UNINSTALL_LIST}"
  Delete "$INSTDIR\app\.devpulse-install"
  RMDir "$INSTDIR\app"
  Delete "$SMPROGRAMS\DevPulse.lnk"
  Delete "$DESKTOP\DevPulse.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DevPulse"
  DeleteRegKey HKCU "Software\DevPulse"
  Delete "$INSTDIR\Uninstall DevPulse.exe"
  RMDir "$INSTDIR"
  end:
SectionEnd
