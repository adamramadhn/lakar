; Hook installer NSIS Lakar (tauri.conf.json -> bundle.windows.nsis.installerHooks; makro hook Tauri v2:
; NSIS_HOOK_PREINSTALL / NSIS_HOOK_PREUNINSTALL, disisipkan di awal Section Install / Section Uninstall).
;
; Masalah: upgrade gagal dengan "Error opening file for writing: ...\lakar-node.exe" karena lakar-node.exe masih
; berjalan (daemon lakard di tray atau yatim, dan server MCP stdio yang dijalankan harness agen dari config lama).
; Template Tauri hanya menghentikan executable utama (CheckIfAppIsRunning lewat Restart Manager).
;
; Solusi: sebelum file disalin/dihapus, hentikan lakar.exe dan setiap lakar-node.exe yang ExecutablePath-nya
; berada di dalam $INSTDIR (bukan proses Node lain, bukan salinan Lakar di direktori lain), lalu tunggu sampai
; executable tidak terkunci (stop-lakar.ps1, batas 15 detik; sisa kunci diganti nama menjadi *.old).
; Konfirmasi "Lakar is running" tetap satu kali: hook menanyakannya sendiri dengan teks template, sehingga
; CheckIfAppIsRunning template sesudah hook tidak menemukan apa pun dan tidak bertanya lagi.

; __FILEDIR__ harus dibaca di tingkat atas (saat file ini di-include), bukan di dalam makro.
!define LAKAR_HOOKS_DIR "${__FILEDIR__}"

; Hentikan proses Lakar di DIRS (dipisah '|'). Bertanya dulu bila aplikasi utama berjalan dan installer
; interaktif; Cancel -> Abort (sama dengan perilaku template).
!macro LAKAR_STOP_PROCESSES DIRS
  Push $0
  Push $1
  InitPluginsDir
  File "/oname=$PLUGINSDIR\lakar-stop.ps1" "${LAKAR_HOOKS_DIR}\stop-lakar.ps1"
  System::Call 'Kernel32::SetEnvironmentVariable(t "LAKAR_STOP_DIRS", t "${DIRS}") i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "LAKAR_STOP_NAMES", t "${MAINBINARYNAME}.exe|lakar-node.exe") i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "LAKAR_STOP_MAIN", t "${MAINBINARYNAME}.exe") i'
  StrCpy $1 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\lakar-stop.ps1"'

  nsExec::Exec '$1 -Mode check'
  Pop $0
  ${If} $0 = 2
  ${AndIfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
    nsis_tauri_utils::StrReplace "$(appRunningOkKill)" "{{product_name}}" "${PRODUCTNAME}"
    Pop $0
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "$0" /SD IDOK IDOK +2
    Abort
  ${EndIf}

  DetailPrint "Stopping running Lakar processes..."
  nsExec::ExecToLog '$1 -Mode stop'
  Pop $0
  DetailPrint "Lakar process check finished ($0)."
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro LAKAR_STOP_PROCESSES "$INSTDIR"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Uninstall juga berjalan sebagai langkah "uninstall before installing" saat upgrade: salinan Node MCP di
  ; app-data (%LOCALAPPDATA%\<bundle id>\mcp) hanya dihentikan bila app-data memang akan dihapus.
  Push $2
  StrCpy $2 "$INSTDIR"
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ReadEnvStr $2 LOCALAPPDATA
    StrCpy $2 "$INSTDIR|$2\${BUNDLEID}\mcp"
  ${EndIf}
  !insertmacro LAKAR_STOP_PROCESSES "$2"
  Pop $2
!macroend
