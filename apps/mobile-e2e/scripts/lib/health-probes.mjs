// Conferências do ambiente mobile, uma por "serviço" que a suíte precisa:
// celular online, APK do app e driver do Appium. Cada uma tem o próprio
// resultado, para o painel mostrar o que caiu em vez de "mobile fora do ar".
import fs from 'node:fs';
import path from 'node:path';

/** `onlineDevices` e `exists` são injetados para testar sem adb nem disco. */
export function createProbes({ onlineDevices, apkPath, driverDir, wantedUdid = '', exists = fs.existsSync }) {
  return [
    {
      name: 'device',
      label: 'Celular ou emulador online',
      run: () => {
        const devices = onlineDevices();
        if (!devices.length) throw new Error('nenhum device online no adb');
        if (wantedUdid && !devices.includes(wantedUdid)) throw new Error(`${wantedUdid} não está online (online: ${devices.join(', ')})`);
        return devices.join(', ');
      },
    },
    {
      name: 'apk',
      label: 'APK do My Demo App',
      run: () => {
        if (!exists(apkPath)) throw new Error('APK ausente: rode npm run apk:download');
        return path.basename(apkPath);
      },
    },
    {
      name: 'driver',
      label: 'Driver UiAutomator2 do Appium',
      run: () => {
        if (!exists(driverDir)) throw new Error('driver ausente: rode npm run appium:setup');
        return 'instalado';
      },
    },
  ];
}

export function runProbes(probes, only = []) {
  const unknown = only.filter((name) => !probes.some((p) => p.name === name));
  if (unknown.length) throw new Error(`conferência desconhecida: ${unknown.join(', ')} (opções: ${probes.map((p) => p.name).join(', ')})`);
  const selected = only.length ? probes.filter((p) => only.includes(p.name)) : probes;
  return selected.map((probe) => {
    const started = performance.now();
    try {
      return { name: probe.name, label: probe.label, ok: true, detail: probe.run(), ms: Math.round(performance.now() - started) };
    } catch (error) {
      return { name: probe.name, label: probe.label, ok: false, detail: error.message, ms: Math.round(performance.now() - started) };
    }
  });
}
