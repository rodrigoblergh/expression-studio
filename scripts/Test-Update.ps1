$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Update-ExpressionStudio.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Join-Path ([IO.Path]::GetTempPath()) ('ExpressionStudio-tests-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$script:passed = 0
function Assert-True($Value, $Message) { if (!$Value) { throw $Message }; $script:passed++ }
function Assert-Rejected([scriptblock]$Action, $Message) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Assert-True $rejected $Message
}
function New-TestPackage([string]$Name, [string[]]$Extra = @(), [string]$Version = '1.2.3') {
    $path = Join-Path $root "$Name.zip"
    $zip = [IO.Compression.ZipFile]::Open($path, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $entries = @{'AE-ExpressionEditor/CSXS/manifest.xml' = "<ExtensionManifest ExtensionBundleId=`"com.aeexpressioneditor.panel`" ExtensionBundleVersion=`"$Version`"/>"; 'AE-ExpressionEditor/index.html'='<html></html>'}
        foreach ($key in $entries.Keys) { $entry = $zip.CreateEntry($key); $writer = [IO.StreamWriter]::new($entry.Open()); try { $writer.Write($entries[$key]) } finally { $writer.Dispose() } }
        foreach ($key in $Extra) { $entry = $zip.CreateEntry($key); $writer = [IO.StreamWriter]::new($entry.Open()); try { $writer.Write('bad') } finally { $writer.Dispose() } }
    } finally { $zip.Dispose() }
    return $path
}
$valid = New-TestPackage 'valid'
$stage = Join-Path $root 'valid-stage'
Expand-ExpressionStudioPackage $valid $stage '1.2.3'
Assert-True ((Get-ExpressionStudioManifestVersion $stage).ToString() -eq '1.2.3') 'Valid package failed.'
foreach ($unsafe in @('AE-ExpressionEditor/../escape.js','other/index.html','AE-ExpressionEditor/C:\escape','AE-ExpressionEditor/a/../../escape','AE-ExpressionEditor/NUL.txt','AE-ExpressionEditor/trailing.','AE-ExpressionEditor//double','AE-ExpressionEditor/INDEX.HTML')) {
    $id = [guid]::NewGuid().ToString('N'); $archive=New-TestPackage $id @($unsafe)
    Assert-Rejected { Expand-ExpressionStudioPackage $archive (Join-Path $root "$id-stage") '1.2.3' } "Unsafe path accepted: $unsafe"
}
Assert-Rejected { Expand-ExpressionStudioPackage $valid (Join-Path $root 'wrong-version') '1.2.4' } 'Wrong version accepted.'
Assert-Rejected { Assert-ExpressionStudioPath (Join-Path $root 'unrelated') } 'Unrelated folder accepted.'
$checksum = Join-Path $root 'SHA256SUMS.txt'
$hash = (Get-FileHash $valid -Algorithm SHA256).Hash
"$hash  Expression-Studio-1.2.3.zip" | Set-Content $checksum
Assert-ExpressionStudioChecksum $valid $checksum 'Expression-Studio-1.2.3.zip'; $script:passed++
('0' * 64 + '  Expression-Studio-1.2.3.zip') | Set-Content $checksum
Assert-Rejected { Assert-ExpressionStudioChecksum $valid $checksum 'Expression-Studio-1.2.3.zip' } 'Bad checksum accepted.'
@("$hash  Expression-Studio-1.2.3.zip", "$hash  Expression-Studio-1.2.3.zip") | Set-Content $checksum
Assert-Rejected { Assert-ExpressionStudioChecksum $valid $checksum 'Expression-Studio-1.2.3.zip' } 'Duplicate checksum accepted.'
function New-InstallFixture([string]$Name,[string]$ExistingVersion='') {
    $caseRoot=Join-Path $root $Name
    $target=Join-Path $caseRoot 'AE-ExpressionEditor';$payload=Join-Path $caseRoot 'stage';$backups=Join-Path $caseRoot 'backups'
    [IO.Directory]::CreateDirectory($caseRoot)|Out-Null
    Expand-ExpressionStudioPackage $valid $payload '1.2.3'
    if($ExistingVersion) {
        [IO.Directory]::CreateDirectory((Join-Path $target 'CSXS'))|Out-Null
        [IO.File]::WriteAllText((Join-Path $target 'CSXS/manifest.xml'),"<ExtensionManifest ExtensionBundleId=""com.aeexpressioneditor.panel"" ExtensionBundleVersion=""$ExistingVersion""/>")
        [IO.File]::WriteAllText((Join-Path $target 'index.html'),'old application')
        [IO.File]::WriteAllText((Join-Path $target 'user-note.txt'),'preserve original file')
    }
    return @{Target=$target;Stage=$payload;Backups=$backups}
}
function Invoke-FixtureInstall($Fixture,[string]$InstalledVersion='0.0.0') {
    Install-ExpressionStudioPayload -StagePath $Fixture.Stage -ExpectedVersion '1.2.3' -InstalledVersion $InstalledVersion -TargetPath $Fixture.Target -BackupRoot $Fixture.Backups -Confirm:$false
}
$fixture=New-InstallFixture 'initial-install'
$result=Invoke-FixtureInstall $fixture
Assert-True ($result.Installed -and !$result.BackupPath -and (Get-ExpressionStudioManifestVersion $fixture.Target).ToString() -eq '1.2.3') 'Initial installation failed.'
Assert-True (!(Test-Path -LiteralPath $fixture.Stage)) 'Initial stage was not moved.'
$fixture=New-InstallFixture 'upgrade' '1.0.0'
$result=Invoke-FixtureInstall $fixture '1.0.0'
Assert-True ($result.Installed -and (Get-ExpressionStudioManifestVersion $fixture.Target).ToString() -eq '1.2.3') 'Upgrade failed.'
Assert-True ((Get-ExpressionStudioManifestVersion $result.BackupPath).ToString() -eq '1.0.0' -and [IO.File]::ReadAllText((Join-Path $result.BackupPath 'user-note.txt')) -eq 'preserve original file') 'Upgrade did not preserve complete original backup.'
$fixture=New-InstallFixture 'wrong-identity' '1.0.0'
[IO.File]::WriteAllText((Join-Path $fixture.Target 'CSXS/manifest.xml'),'<ExtensionManifest ExtensionBundleId="other.extension" ExtensionBundleVersion="1.0.0"/>')
Assert-Rejected {Invoke-FixtureInstall $fixture '1.0.0'} 'Unrelated extension identity was replaced.'
Assert-True ([IO.File]::ReadAllText((Join-Path $fixture.Target 'user-note.txt')) -eq 'preserve original file' -and (Test-Path -LiteralPath $fixture.Stage) -and !(Test-Path -LiteralPath $fixture.Backups)) 'Rejected installation modified original or stage.'
$fixture=New-InstallFixture 'changed-version' '1.1.0'
Assert-Rejected {Invoke-FixtureInstall $fixture '1.0.0'} 'Changed installed version was accepted.'
$fixture=New-InstallFixture 'declined' '1.0.0'
$result=Install-ExpressionStudioPayload -StagePath $fixture.Stage -ExpectedVersion '1.2.3' -InstalledVersion '1.0.0' -TargetPath $fixture.Target -BackupRoot $fixture.Backups -WhatIf
Assert-True (!$result.Installed -and (Get-ExpressionStudioManifestVersion $fixture.Target).ToString() -eq '1.0.0' -and (Test-Path -LiteralPath $fixture.Stage) -and !(Test-Path -LiteralPath $fixture.Backups)) 'WhatIf changed installation files.'
# Scoped injection exercises real temporary directory backup/rollback; no CEP paths are touched.
$script:injectedSource=$null;$script:injectedMode=$null
function Move-Item {
    [CmdletBinding()]
    param([string]$LiteralPath,[string]$Destination)
    if($LiteralPath -eq $script:injectedSource) {
        if($script:injectedMode -eq 'move-failure') {
            [IO.Directory]::CreateDirectory($Destination)|Out-Null
            [IO.File]::WriteAllText((Join-Path $Destination 'partial.txt'),'partial payload')
            throw 'Injected staging move failure'
        }
        Microsoft.PowerShell.Management\Move-Item -LiteralPath $LiteralPath -Destination $Destination -ErrorAction Stop
        if($script:injectedMode -eq 'verification-failure') {
            [IO.File]::WriteAllText((Join-Path $Destination 'CSXS/manifest.xml'),'<ExtensionManifest ExtensionBundleId="com.aeexpressioneditor.panel" ExtensionBundleVersion="9.9.9"/>')
        }
        return
    }
    Microsoft.PowerShell.Management\Move-Item -LiteralPath $LiteralPath -Destination $Destination -ErrorAction Stop
}
try {
    foreach($mode in @('move-failure','verification-failure')) {
        $fixture=New-InstallFixture $mode '1.0.0'
        $script:injectedSource=$fixture.Stage;$script:injectedMode=$mode
        Assert-Rejected {Invoke-FixtureInstall $fixture '1.0.0'} "$mode did not fail installation."
        Assert-True ((Get-ExpressionStudioManifestVersion $fixture.Target).ToString() -eq '1.0.0' -and [IO.File]::ReadAllText((Join-Path $fixture.Target 'user-note.txt')) -eq 'preserve original file') "$mode did not restore the original."
        Assert-True (!(Test-Path -LiteralPath (Join-Path $fixture.Target 'partial.txt'))) "$mode retained partial replacement."
    }
    $fixture=New-InstallFixture 'failed-initial'
    $script:injectedSource=$fixture.Stage;$script:injectedMode='move-failure'
    Assert-Rejected {Invoke-FixtureInstall $fixture} 'Failed initial installation did not report failure.'
    Assert-True (!(Test-Path -LiteralPath $fixture.Target) -and (Test-Path -LiteralPath $fixture.Stage)) 'Failed initial install retained partial target or lost staged source.'
} finally { Remove-Item Function:\Move-Item; $script:injectedSource=$null;$script:injectedMode=$null }
function New-DiscoveryTree([string]$Path) {
    [IO.Directory]::CreateDirectory((Join-Path $Path 'CSXS'))|Out-Null
    [IO.File]::WriteAllText((Join-Path $Path 'CSXS/manifest.xml'),'<ExtensionManifest ExtensionBundleId="com.aeexpressioneditor.panel" ExtensionBundleVersion="1.0.0"/>')
    [IO.File]::WriteAllText((Join-Path $Path 'index.html'),'existing application')
}
foreach($location in @('user','common64','common32')) {
    foreach($name in @('AE-ExpressionEditor','AE Expression Editor')) {
        $case=Join-Path $root ('discovery-'+[guid]::NewGuid().ToString('N'))
        $user=Join-Path $case 'user';$common=@((Join-Path $case 'common64'),(Join-Path $case 'common32'))
        $existing=Join-Path (Join-Path $case $location) $name
        New-DiscoveryTree $existing
        $discovered=Resolve-ExpressionStudioInstallPath -UserRoot $user -CommonRoots $common
        Assert-True ($discovered -eq $existing) "Discovery ignored $location/$name."
    }
}
$case=Join-Path $root 'discovery-duplicates';$user=Join-Path $case 'user';$common=@((Join-Path $case 'common64'),(Join-Path $case 'common32'))
$systemInstall=Join-Path $common[1] 'AE Expression Editor';New-DiscoveryTree $systemInstall
Assert-Rejected {Resolve-ExpressionStudioInstallPath -RequestedPath (Join-Path $user 'AE-ExpressionEditor') -UserRoot $user -CommonRoots $common} 'Explicit alternate destination bypassed installed discovery.'
New-DiscoveryTree (Join-Path $user 'AE-ExpressionEditor')
Assert-Rejected {Resolve-ExpressionStudioInstallPath -UserRoot $user -CommonRoots $common} 'Duplicate installations were not refused.'
$case=Join-Path $root 'discovery-empty';$user=Join-Path $case 'user';$common=@((Join-Path $case 'common64'),(Join-Path $case 'common32'))
Assert-True ((Resolve-ExpressionStudioInstallPath -UserRoot $user -CommonRoots $common) -eq (Join-Path $user 'AE-ExpressionEditor')) 'Fresh installation did not choose canonical user path.'
Assert-Rejected {Assert-ExpressionStudioPath (Join-Path $user 'AE Expression Editor')} 'Unverified missing display-name installation was accepted.'
$unrelated=Join-Path $common[0] 'AE Expression Editor';New-DiscoveryTree $unrelated
[IO.File]::WriteAllText((Join-Path $unrelated 'CSXS/manifest.xml'),'<ExtensionManifest ExtensionBundleId="other.extension" ExtensionBundleVersion="1.0.0"/>')
Assert-Rejected {Resolve-ExpressionStudioInstallPath -UserRoot $user -CommonRoots $common} 'Unrelated identity in Adobe folder was accepted.'
Assert-Rejected {Assert-ExpressionStudioElevation -Path $unrelated -CommonRoots $common -IsAdministrator $false} 'System update did not require administrator.'
Assert-ExpressionStudioElevation -Path $unrelated -CommonRoots $common -IsAdministrator $true;$script:passed++
Assert-ExpressionStudioElevation -Path (Join-Path $user 'AE-ExpressionEditor') -CommonRoots $common -IsAdministrator $false;$script:passed++
# The verified display-name destination survives installation and rollback without renaming.
$fixture=New-InstallFixture 'display-name-upgrade' '1.0.0'
$displayTarget=Join-Path ([IO.Path]::GetDirectoryName($fixture.Target)) 'AE Expression Editor'
[IO.Directory]::Move($fixture.Target,$displayTarget);$fixture.Target=$displayTarget
$result=Invoke-FixtureInstall $fixture '1.0.0'
Assert-True ($result.Installed -and (Get-ExpressionStudioManifestVersion $displayTarget).ToString() -eq '1.2.3' -and !(Test-Path -LiteralPath (Join-Path ([IO.Path]::GetDirectoryName($displayTarget)) 'AE-ExpressionEditor'))) 'Display-name update changed destination or created duplicate.'
Write-Output "PASS: $script:passed updater validation, filesystem and discovery checks. Temporary fixtures: $root"
