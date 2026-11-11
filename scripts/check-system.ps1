# AI FUTURE LAB — 설치 전 Windows PC 점검
# 실행: powershell -ExecutionPolicy Bypass -File scripts\check-system.ps1
# 결과를 화면에 표시하고 system-check.txt 로 저장합니다.

$ErrorActionPreference = 'SilentlyContinue'
$out = @()
function Add($k, $v, $ok = $null) {
  $mark = if ($ok -eq $true) { '[OK]  ' } elseif ($ok -eq $false) { '[주의]' } else { '      ' }
  $line = "{0} {1,-22} {2}" -f $mark, $k, $v
  $script:out += $line
  Write-Host $line
}

Write-Host "=== AI FUTURE LAB 시스템 점검 ===`n"
$os = Get-CimInstance Win32_OperatingSystem
Add 'Windows' "$($os.Caption) $($os.Version) ($($os.OSArchitecture))" ($os.OSArchitecture -match '64')

$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
Add 'CPU' "$($cpu.Name.Trim()) · $($cpu.NumberOfCores)코어/$($cpu.NumberOfLogicalProcessors)스레드" ($cpu.NumberOfLogicalProcessors -ge 4)

$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
Add '메모리' "$ramGB GB (권장 8GB 이상)" ($ramGB -ge 8)

foreach ($g in Get-CimInstance Win32_VideoController) {
  $vram = if ($g.AdapterRAM -gt 0) { "$([math]::Round($g.AdapterRAM / 1GB, 1))GB" } else { '정보 없음' }
  Add 'GPU' "$($g.Name) · VRAM $vram · 드라이버 $($g.DriverVersion)"
  if ($g.CurrentHorizontalResolution) {
    $ok = ($g.CurrentHorizontalResolution -ge 1920 -and $g.CurrentVerticalResolution -ge 1080)
    Add '  해상도' "$($g.CurrentHorizontalResolution)×$($g.CurrentVerticalResolution) @ $($g.CurrentRefreshRate)Hz (목표 1920×1080 · 60Hz)" $ok
  }
}

Add-Type -AssemblyName System.Windows.Forms
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  Add '모니터' "$($s.DeviceName) $($s.Bounds.Width)×$($s.Bounds.Height) $(if ($s.Primary) {'(주 모니터)'})"
}

$disk = Get-PSDrive -Name ($PSScriptRoot.Substring(0, 1))
Add '디스크 여유' "$([math]::Round($disk.Free / 1GB, 1)) GB (설치에 약 0.5GB 필요)" ($disk.Free -gt 1GB)

# 한국어 음성(오프라인 TTS)
Add-Type -AssemblyName System.Speech
$voices = (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$ko = $voices | Where-Object { $_.Culture.Name -like 'ko*' }
if ($ko) { Add '한국어 음성' (($ko | ForEach-Object { $_.Name }) -join ', ') $true }
else { Add '한국어 음성' '없음 → 설정 > 시간 및 언어 > 음성 > 음성 추가 > 한국어 (없으면 자막만 표시)' $false }

# 키보드형 HID 장치(발판 후보)
$kbd = Get-PnpDevice -Class Keyboard -Status OK | Select-Object -ExpandProperty FriendlyName
Add '키보드 장치' "$($kbd.Count)개: $(($kbd | Select-Object -Unique) -join ' / ')"
$hid = Get-PnpDevice -Class HIDClass -Status OK | Where-Object { $_.FriendlyName -match 'game|joystick|게임' } | Select-Object -ExpandProperty FriendlyName
if ($hid) { Add '게임패드형 HID' (($hid | Select-Object -Unique) -join ' / ') }

# 전원/절전
$plan = (powercfg /getactivescheme) -replace '.*\((.*)\).*', '$1'
Add '전원 관리' "$plan (키오스크는 '고성능' 권장, 화면 꺼짐은 프로그램이 막음)"

# 네트워크(프로그램은 사용하지 않음)
$net = Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet
Add '인터넷' "$(if ($net) {'연결됨'} else {'연결 안 됨'}) — 실행에는 필요 없음"

$out | Out-File -Encoding utf8 (Join-Path (Get-Location) 'system-check.txt')
Write-Host "`n결과를 system-check.txt 에 저장했습니다."
