param([Parameter(Mandatory = $true)][string]$PSpiceExe)
$ErrorActionPreference = 'Stop'
$packageDir = $PSScriptRoot
$handoff = Get-Content (Join-Path $packageDir 'handoff.json') -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $PSpiceExe -PathType Leaf)) { throw 'PSpice executable not found.' }
function Assert-Hash([string]$file, [string]$expected) {
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw "File differs from the exported circuit package: $file"
    }
}
Assert-Hash (Join-Path $packageDir 'TPS62903_TRANS.LIB') $handoff.vendorLibrarySha256
Assert-Hash (Join-Path $packageDir 'TPS62903_TRANS.LIBsig') $handoff.vendorSignatureSha256
$caseResults = @()
foreach ($case in $handoff.cases) {
    $deck = Join-Path $packageDir $case.file
    Assert-Hash $deck $case.sha256
    $output = [IO.Path]::ChangeExtension($deck, '.out')
    # Exclude an old output before interpreting this run. Keep it for comparison.
    if (Test-Path -LiteralPath $output) {
        Move-Item -LiteralPath $output -Destination ($output + '.' + [Guid]::NewGuid().ToString() + '.previous')
    }
    # Cadence documents -r (run) and -e (exit after all simulations).
    # This wrapper has not been executed on Windows in this project.
    $process = Start-Process -FilePath $PSpiceExe -ArgumentList ('-r -e "' + $deck + '"') -WorkingDirectory $packageDir -Wait -PassThru
    $values = @{}
    $errors = @()
    if (Test-Path -LiteralPath $output) {
        $lines = Get-Content -LiteralPath $output
        $errors = @($lines | Where-Object { $_ -match '^\s*(ERROR\b|FATAL\b|.*SIMULATION ABORTED)' })
        foreach ($key in $handoff.requiredMeasurements) {
            $pattern = '^\s*' + [Regex]::Escape($key) + '\s*=\s*([+-]?[0-9.]+(?:[Ee][+-]?[0-9]+)?)\b'
            $found = @($lines | Select-String -Pattern $pattern)
            if ($found.Count -eq 1) {
                $values[$key] = [double]::Parse($found[0].Matches[0].Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
            }
        }
    }
    $complete = ($process.ExitCode -eq 0) -and ($errors.Count -eq 0) -and ($values.Count -eq $handoff.requiredMeasurements.Count)
    $inside = $null
    if ($complete) {
        $inside = $true
        foreach ($key in $handoff.requiredMeasurements) {
            $v = $values[$key]
            if ([double]::IsNaN($v) -or [double]::IsInfinity($v) -or $v -lt $handoff.voltageWindowV[0] -or $v -gt $handoff.voltageWindowV[1]) { $inside = $false }
        }
        foreach ($phase in @('PRE', 'STEP', 'POST')) {
            if ($values['VDD_' + $phase + '_MIN'] -gt $values['VDD_' + $phase + '_MAX']) { $complete = $false; $inside = $null }
        }
    }
    $caseResults += [PSCustomObject]@{
        file = $case.file; exitCode = $process.ExitCode; completed = $complete
        insideVoltageWindow = $inside; measurements = $values; errors = $errors
    }
    [PSCustomObject]@{ sourceSha256 = $handoff.sourceSha256; hardwareQualified = $false; cases = $caseResults } |
        ConvertTo-Json -Depth 8 | Set-Content (Join-Path $packageDir 'run-results.json') -Encoding UTF8
    Write-Host ($case.file + ': completed=' + $complete + ', inside voltage window=' + $inside)
}
if (@($caseResults | Where-Object { -not $_.completed }).Count) { exit 2 }
if (@($caseResults | Where-Object { -not $_.insideVoltageWindow }).Count) { exit 1 }
exit 0
