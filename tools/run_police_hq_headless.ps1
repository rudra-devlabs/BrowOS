param(
    [string]$BlenderPath = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$BlenderCandidates = @(
    $BlenderPath,
    (Join-Path $env:ProgramFiles 'Blender Foundation\Blender 4.5\blender.exe'),
    (Join-Path $env:ProgramFiles 'Blender Foundation\Blender 4.3\blender.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Blender Foundation\Blender 4.3\blender.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if ($BlenderCandidates.Count -gt 0) {
    $blender = $BlenderCandidates[0]
    & $blender -b --factory-startup --python (Join-Path $Root 'tools\build_police_hq.py') -- $Root
    if ($LASTEXITCODE -ne 0) { throw "Headless Blender export failed with exit code $LASTEXITCODE" }
    Write-Output "Exported police_hq.glb with headless Blender: $blender"
} else {
    Write-Warning 'Blender was not found; using the dependency-free headless GLB exporter.'
    node (Join-Path $Root 'tools\build_police_hq_headless.js')
    if ($LASTEXITCODE -ne 0) { throw "Fallback GLB export failed with exit code $LASTEXITCODE" }
}
