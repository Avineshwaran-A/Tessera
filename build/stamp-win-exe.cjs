// electron-builder afterPack hook: stamps Tessera's icon and version info into Tessera.exe
// with a pure-JS PE editor, so Windows builds work on Linux/macOS without Wine.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function stampWinExe(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const { NtExecutable, NtExecutableResource, Resource, Data } = ResEdit;
  const pkg = require(path.join(ctx.packager.projectDir, 'package.json'));
  const exePath = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  const ico = Data.IconFile.from(fs.readFileSync(path.join(ctx.packager.projectDir, 'build', 'icon.ico')));
  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map(i => i.data));

  const vi = Resource.VersionInfo.fromEntries(res.entries)[0] ?? Resource.VersionInfo.createEmpty();
  const [ma, mi, pa] = pkg.version.split('.').map(Number);
  vi.setFileVersion(ma, mi, pa, 0, 1033); vi.setProductVersion(ma, mi, pa, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'Tessera', ProductName: 'Tessera', CompanyName: 'Tessera',
    OriginalFilename: 'Tessera.exe', InternalName: 'Tessera', LegalCopyright: `© ${new Date().getFullYear()} ${pkg.author?.name ?? 'Tessera'}`,
    FileVersion: pkg.version, ProductVersion: pkg.version,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • stamped icon + version info into', path.basename(exePath));
};
