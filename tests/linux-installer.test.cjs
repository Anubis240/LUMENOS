'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('live image includes Debian Calamares with a Lumen launcher and branding',()=>{
  const packages=read('linux/live-build/config/package-lists/lumen.list.chroot');
  const desktop=read('linux/desktop/lumen-installer.desktop');
  const wrapper=read('linux/bin/lumen-installer');
  const branding=read('linux/installer/branding/lumen/branding.desc');
  const slideshow=read('linux/installer/branding/lumen/show.qml');
  const stage=read('linux/stage-iso.sh');
  const hook=read('linux/live-build/config/hooks/live/0900-lumen.hook.chroot');
  assert.match(packages,/^calamares-settings-debian$/m);
  assert.match(desktop,/^Name=Install Lumen OS$/m);
  assert.match(desktop,/^Exec=\/usr\/local\/bin\/lumen-installer$/m);
  assert.match(wrapper,/sudo -n env/);
  assert.match(wrapper,/\/usr\/bin\/calamares/);
  assert.match(wrapper,/\/run\/live\/medium/);
  assert.match(branding,/productName: Lumen OS/);
  assert.match(branding,/bootloaderEntryName: Lumen OS/);
  assert.match(branding,/welcomeExpandingLogo: true/);
  assert.match(branding,/slideshow: "show\.qml"/);
  assert.match(slideshow,/Lumen OS is being installed/);
  assert.match(stage,/lumen-installer\.desktop/);
  assert.match(stage,/etc\/calamares\/branding\/lumen/);
  assert.match(hook,/branding: lumen/);
  assert.match(hook,/test -x \/usr\/bin\/calamares-install-debian/);
  assert.match(hook,/test -x \/usr\/local\/bin\/lumen-installer/);
});

test('Lumen applications expose the installer only through the live-session wrapper',()=>{
  const {APPS}=require('../backend/platform.cjs');
  const installer=APPS.find(app=>app.id==='installer');
  assert.deepEqual(installer,{id:'installer',name:'Install Lumen OS',executable:'/usr/local/bin/lumen-installer',icon:'installer'});
});
