# Windows CEP update helper. Existing Adobe or per-user installations are preserved. Check-only unless -Install is explicitly supplied.
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [switch]$Install,
    [switch]$CheckOnly,
    [string]$InstallPath
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Verify-Update.ps1')
function Get-ExpressionStudioManifestVersion([string]$Directory) {
    $manifestPath = Join-Path $Directory 'CSXS\manifest.xml'
    if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'The extension manifest is missing; refusing to replace this directory.' }
    $settings = [Xml.XmlReaderSettings]::new(); $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $reader = [Xml.XmlReader]::Create($manifestPath, $settings)
    try { $xml = [Xml.XmlDocument]::new(); $xml.XmlResolver = $null; $xml.Load($reader) } finally { $reader.Dispose() }
    $manifest = $xml.DocumentElement
    if ($manifest.Name -ne 'ExtensionManifest' -or $manifest.GetAttribute('ExtensionBundleId') -ne 'com.aeexpressioneditor.panel') { throw 'This folder is not the Expression Studio extension.' }
    $version = $manifest.GetAttribute('ExtensionBundleVersion')
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid extension version.' }
    return [version]$version
}
function Assert-ExpressionStudioNoLinks([string]$Path) {
    $item = [IO.Path]::GetFullPath($Path)
    while ($item) {
        if (Test-Path -LiteralPath $item) {
            if ((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Installation paths containing links or junctions are not supported.' }
        }
        $parent = [IO.Path]::GetDirectoryName($item)
        if ($parent -eq $item) { break }; $item = $parent
    }
}
function Assert-ExpressionStudioPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $name = [IO.Path]::GetFileName($full)
    if ($name -ne 'AE-ExpressionEditor' -and $name -ne 'AE Expression Editor') { throw 'Installation folder must be AE-ExpressionEditor or the verified Adobe folder AE Expression Editor.' }
    Assert-ExpressionStudioNoLinks $full
    if (Test-Path -LiteralPath $full) { $null = Get-ExpressionStudioManifestVersion $full }
    elseif ($name -eq 'AE Expression Editor') { throw 'The Adobe display-name folder must already contain the verified Expression Studio extension.' }
    return $full
}
function Get-ExpressionStudioCommonRoots {
    @($env:CommonProgramFiles, [Environment]::GetEnvironmentVariable('CommonProgramFiles(x86)'), $env:CommonProgramW6432) | Where-Object { $_ } | ForEach-Object { Join-Path $_ 'Adobe\CEP\extensions' } | Select-Object -Unique
}
function Resolve-ExpressionStudioInstallPath {
    param([string]$RequestedPath,[string]$UserRoot=(Join-Path $env:APPDATA 'Adobe\CEP\extensions'),[string[]]$CommonRoots=@(Get-ExpressionStudioCommonRoots))
    $found = @{}
    foreach ($base in @($UserRoot) + $CommonRoots) {
        if (!$base) { continue }
        foreach ($name in @('AE-ExpressionEditor','AE Expression Editor')) {
            $candidate = [IO.Path]::GetFullPath((Join-Path $base $name))
            if (Test-Path -LiteralPath $candidate) { $verified = Assert-ExpressionStudioPath $candidate; $found[$verified] = $verified }
        }
    }
    $requested = $null
    if ($RequestedPath) {
        $requested = Assert-ExpressionStudioPath $RequestedPath
        if (Test-Path -LiteralPath $requested) { $found[$requested] = $requested }
    }
    if ($found.Count -gt 1) { throw ('Multiple Expression Studio installations found. Resolve duplicates before updating: ' + (($found.Values | Sort-Object) -join '; ')) }
    if ($found.Count -eq 1) {
        $existing = @($found.Values)[0]
        if ($requested -and $requested -ne $existing) { throw "Expression Studio already exists at $existing. Use that installation path to avoid a duplicate." }
        return $existing
    }
    if ($requested) { return $requested }
    return Assert-ExpressionStudioPath (Join-Path $UserRoot 'AE-ExpressionEditor')
}
function Test-ExpressionStudioAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    try { return ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
    finally { $identity.Dispose() }
}
function Assert-ExpressionStudioElevation {
    param([string]$Path,[string[]]$CommonRoots=@(Get-ExpressionStudioCommonRoots),[bool]$IsAdministrator=(Test-ExpressionStudioAdministrator))
    $full = [IO.Path]::GetFullPath($Path)
    foreach ($base in $CommonRoots) {
        $prefix = [IO.Path]::GetFullPath($base).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        if ($full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -and !$IsAdministrator) {
            throw "Expression Studio is installed for all users at $full. Save your project and close After Effects, then open PowerShell as administrator and rerun this helper with -Install. No files were downloaded or changed; the updater will preserve this installation path."
        }
    }
}
function Expand-ExpressionStudioPackage([string]$ArchivePath, [string]$StagePath, [string]$ExpectedVersion) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $root = [IO.Path]::GetFullPath($StagePath)
    if (Test-Path -LiteralPath $root) { throw 'Staging directory must not already exist.' }
    $zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $seen = @{}; $total = 0L
        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName
            if ($name -notmatch '^AE-ExpressionEditor/' -or $name.Contains('\') -or $name.Contains(':')) { throw 'Unsafe package path.' }
            $relative = $name.Substring('AE-ExpressionEditor/'.Length)
            if (!$relative) { continue }
            foreach ($part in $relative.TrimEnd('/').Split('/')) {
                if (!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[\x00-\x1f<>"|?*]' -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') { throw 'Unsafe package path component.' }
            }
            $dest = [IO.Path]::GetFullPath((Join-Path $root $relative))
            if (!$dest.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Package escapes staging directory.' }
            $key = $relative.TrimEnd('/')
            if ($seen.ContainsKey($key)) { throw 'Duplicate package path.' }; $seen[$key] = $true
            $type = ($entry.ExternalAttributes -shr 16) -band 0xF000
            if ($type -ne 0 -and $type -ne 0x8000 -and $type -ne 0x4000) { throw 'Links and special files are not allowed in packages.' }
            $total += $entry.Length
            if ($zip.Entries.Count -gt 5000 -or $total -gt 100MB -or $entry.Length -gt 30MB) { throw 'Package exceeds size limits.' }
        }
        [IO.Directory]::CreateDirectory($root) | Out-Null
        foreach ($entry in $zip.Entries) {
            $relative = $entry.FullName.Substring('AE-ExpressionEditor/'.Length)
            if (!$relative) { continue }
            $dest = Join-Path $root $relative
            if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($dest) | Out-Null }
            else {
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest)) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $false)
            }
        }
    } finally { $zip.Dispose() }
    if ((Get-ExpressionStudioManifestVersion $root).ToString() -ne $ExpectedVersion) { throw 'Package manifest version does not match the release.' }
    if (!(Test-Path -LiteralPath (Join-Path $root 'index.html') -PathType Leaf)) { throw 'Package entry point missing.' }
}
function Assert-ExpressionStudioChecksum([string]$ArchivePath, [string]$ChecksumPath, [string]$AssetName) {
    $matchesFound = @(Get-Content -LiteralPath $ChecksumPath | Where-Object { $_ -match ('^[a-fA-F0-9]{64} [ *]' + [regex]::Escape($AssetName) + '$') })
    if ($matchesFound.Count -ne 1) { throw 'Release checksum is missing or ambiguous.' }
    $actual = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
    if ($actual -ne $matchesFound[0].Substring(0,64)) { throw 'Package checksum verification failed.' }
}
function Install-ExpressionStudioPayload {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$StagePath,
        [Parameter(Mandatory)][string]$ExpectedVersion,
        [Parameter(Mandatory)][version]$InstalledVersion,
        [Parameter(Mandatory)][string]$TargetPath,
        [Parameter(Mandatory)][string]$BackupRoot
    )
    $ErrorActionPreference = 'Stop'
    $target = Assert-ExpressionStudioPath $TargetPath
    $stage = [IO.Path]::GetFullPath($StagePath)
    $backups = [IO.Path]::GetFullPath($BackupRoot)
    $separator = [IO.Path]::DirectorySeparatorChar
    foreach ($pair in @(@($stage,$target),@($backups,$target),@($stage,$backups))) {
        if ($pair[0] -eq $pair[1] -or $pair[0].StartsWith($pair[1].TrimEnd($separator)+$separator,[StringComparison]::OrdinalIgnoreCase) -or $pair[1].StartsWith($pair[0].TrimEnd($separator)+$separator,[StringComparison]::OrdinalIgnoreCase)) { throw 'Stage, installation and backup paths must be separate directories.' }
    }
    foreach ($path in @($stage,$backups)) {
        $item = $path
        while ($item) {
            if ((Test-Path -LiteralPath $item) -and ((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Staging and backup paths cannot contain links.' }
            $parent = [IO.Path]::GetDirectoryName($item); if ($parent -eq $item) { break }; $item = $parent
        }
    }
    if (!(Test-Path -LiteralPath $stage -PathType Container)) { throw 'Staged payload is missing.' }
    if (@(Get-ChildItem -LiteralPath $stage -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Staged payload cannot contain links.' }
    if ((Get-ExpressionStudioManifestVersion $stage).ToString() -cne $ExpectedVersion -or !(Test-Path -LiteralPath (Join-Path $stage 'index.html') -PathType Leaf)) { throw 'Staged payload identity or entry point is invalid.' }
    $hadOriginal = Test-Path -LiteralPath $target
    if ($hadOriginal) {
        if ((Get-ExpressionStudioManifestVersion $target) -ne $InstalledVersion) { throw 'Installed version changed during the update; check again.' }
    } elseif ($InstalledVersion -ne [version]'0.0.0') { throw 'The previous installation disappeared during the update.' }
    if ([version]$ExpectedVersion -le $InstalledVersion) { throw 'Update must be newer than the installed version.' }
    if (!$PSCmdlet.ShouldProcess($target,"Install verified Expression Studio $ExpectedVersion with rollback backup")) { return [pscustomobject]@{Installed=$false;BackupPath=$null} }
    $backup = $null
    if ($hadOriginal) {
        [IO.Directory]::CreateDirectory($backups) | Out-Null
        $backup = Join-Path $backups ("$InstalledVersion-" + [guid]::NewGuid().ToString('N'))
        # Atomic directory move: on a different volume fail without partially moving the original.
        [IO.Directory]::Move($target,$backup)
    }
    try {
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        Move-Item -LiteralPath $stage -Destination $target -ErrorAction Stop
        if ((Get-ExpressionStudioManifestVersion $target).ToString() -cne $ExpectedVersion) { throw 'Installed version verification failed.' }
        return [pscustomobject]@{Installed=$true;BackupPath=$backup}
    } catch {
        $installError = $_
        # target was resolved and checked above; only this owned payload can be removed.
        Assert-ExpressionStudioNoLinks $target
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop }
        if ($backup) { [IO.Directory]::Move($backup,$target) }
        throw $installError
    }
}
if ($MyInvocation.InvocationName -eq '.') { return }
if ($Install -and $CheckOnly) { throw 'Choose either -Install or -CheckOnly.' }
$InstallPath = Resolve-ExpressionStudioInstallPath -RequestedPath $InstallPath
if ($Install) { Assert-ExpressionStudioElevation -Path $InstallPath }
$installed = [version]'0.0.0'
if (Test-Path -LiteralPath $InstallPath) { $installed = Get-ExpressionStudioManifestVersion $InstallPath }
$headers = @{ 'User-Agent' = 'Expression-Studio-Updater'; 'Accept' = 'application/vnd.github+json' }
try { $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/rodrigoblergh/expression-studio/releases/latest' -Headers $headers }
catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { Write-Output 'No stable release is published. Nothing was installed.'; return }
    throw
}
if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v(\d+\.\d+\.\d+)$') { throw 'No valid stable version was returned.' }
$version = $Matches[1]
if ([version]$version -le $installed) { Write-Output "Expression Studio $installed is up to date."; return }
$assetName = "Expression-Studio-$version.zip"
$package = @($release.assets | Where-Object name -eq $assetName)
$checksum = @($release.assets | Where-Object name -eq 'SHA256SUMS.txt')
$signedManifest = @($release.assets | Where-Object name -eq 'update-manifest.json')
$signedSignature = @($release.assets | Where-Object name -eq 'update-manifest.sig')
if ($package.Count -ne 1 -or $checksum.Count -ne 1 -or $signedManifest.Count -ne 1 -or $signedSignature.Count -ne 1) { throw 'The release must contain a unique package, checksum and signed manifest.' }
foreach ($asset in @($package[0], $checksum[0], $signedManifest[0], $signedSignature[0])) {
    $expected = 'https://github.com/rodrigoblergh/expression-studio/releases/download/' + $release.tag_name + '/' + $asset.name
    if ($asset.browser_download_url -cne $expected) { throw 'Unexpected release asset URL.' }
}
Write-Output "Update available: $installed -> $version. Release: $($release.html_url)"
if (!$Install) { Write-Output 'Check only. Run this helper with -Install to review and approve installation.'; return }
if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { throw 'Save your project and close After Effects before installing. No application was closed.' }
if (!$PSCmdlet.ShouldProcess($InstallPath, "Install Expression Studio $version (backup existing files; preserve CEP preferences)")) { return }
$work = Join-Path ([IO.Path]::GetTempPath()) ('ExpressionStudio-update-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($work) | Out-Null
$zipPath = Join-Path $work $assetName; $sumPath = Join-Path $work 'SHA256SUMS.txt'; $stage = Join-Path $work 'stage'
$manifestPath=Join-Path $work 'update-manifest.json'; $signaturePath=Join-Path $work 'update-manifest.sig'
Invoke-WebRequest -Uri $signedManifest[0].browser_download_url -Headers $headers -OutFile $manifestPath -TimeoutSec 30
Invoke-WebRequest -Uri $signedSignature[0].browser_download_url -Headers $headers -OutFile $signaturePath -TimeoutSec 30
$verified = Read-VerifiedUpdateManifest $manifestPath $signaturePath
if ($verified.version -cne $version -or $verified.assetName -cne $assetName) { throw 'Signed manifest does not match the selected release.' }
Invoke-WebRequest -Uri $package[0].browser_download_url -Headers $headers -OutFile $zipPath
Invoke-WebRequest -Uri $checksum[0].browser_download_url -Headers $headers -OutFile $sumPath
Assert-ExpressionStudioChecksum $zipPath $sumPath $assetName
if ((Get-Item -LiteralPath $zipPath).Length -ne $verified.size -or (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $verified.sha256) { throw 'Package does not match the signed release.' }
Expand-ExpressionStudioPackage $zipPath $stage $version
# Recheck immediately before replacing files; never stop After Effects automatically.
if (Get-Process -Name AfterFX -ErrorAction SilentlyContinue) { throw 'After Effects started during the download. Close it and retry.' }
$installResult = Install-ExpressionStudioPayload -StagePath $stage -ExpectedVersion $version -InstalledVersion $installed -TargetPath $InstallPath -BackupRoot (Join-Path $env:LOCALAPPDATA 'ExpressionStudio\backups') -Confirm:$false
$backup = $installResult.BackupPath
Write-Output "Installed Expression Studio $version. Reopen After Effects. Preferences were not changed."
if ($backup) { Write-Output "Previous files retained at: $backup" }
Write-Output "Downloaded files retained at: $work"
