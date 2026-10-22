; Incluído pelo electron-builder no instalador e no desinstalador (package.json: build.nsis.include).
;
; Checagem "o Zênite está aberto?" sem PowerShell. A padrão do electron-builder abre o
; powershell.exe duas a três vezes, e aberto pelo instalador ele ficava parado ~30 s e ~20 s por
; vez (no desinstalador da versão anterior, de novo): uma atualização levava ~100 s, quase tudo
; esperando. Aqui: o Windows trava o .exe enquanto ele roda, então se não dá para abri-lo para
; escrita, o app está aberto. Instantâneo e só olha a pasta desta instalação.

!macro ZENITE_IS_RUNNING _RESULT
  StrCpy ${_RESULT} 0
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 +6
    ClearErrors
    FileOpen $R9 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" a
    IfErrors 0 +2
      StrCpy ${_RESULT} 1
    FileClose $R9
!macroend

!macro customCheckAppRunning
  !insertmacro ZENITE_IS_RUNNING $R0
  ${if} $R0 == 1
    ${if} ${isUpdated}
      ; Atualização pedida pelo próprio app: ele já está fechando.
      Sleep 1500
      !insertmacro ZENITE_IS_RUNNING $R0
    ${endIf}
  ${endIf}
  ${if} $R0 == 1
    ${ifNot} ${isUpdated}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK zenite_close
      Quit
    ${endIf}
    zenite_close:
    DetailPrint "$(appClosing)"
    StrCpy $R1 0
    zenite_wait:
      IntOp $R1 $R1 + 1
      nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
      Pop $R2
      Sleep 500
      !insertmacro ZENITE_IS_RUNNING $R0
      ${if} $R0 == 1
        ${if} $R1 < 10
          Goto zenite_wait
        ${endIf}
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY zenite_close
        Quit
      ${endIf}
  ${endIf}
!macroend
