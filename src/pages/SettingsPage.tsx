import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta, requestPersistence, setMeta } from '../db/database';
import { exportCSV, exportJSON, readBackupFile, restoreBackup, type BackupFile } from '../lib/backup';
import { relativeDay, toISO } from '../lib/format';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

export default function SettingsPage() {
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [rest, setRest] = useState(0);
  const lastExport = useLiveQuery(() => db.meta.get('lastExport').then((m) => (m?.value as number) ?? 0));
  const snapshots = useLiveQuery(() => db.backups.orderBy('createdAt').reverse().toArray());
  const counts = useLiveQuery(async () => ({ w: await db.workouts.count(), s: await db.sets.count(), e: await db.exercises.count() }));

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024 / 1024).toFixed(1)} Mo utilisés`)).catch(() => {});
    getMeta('restSeconds', 0).then(setRest);
  }, []);

  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;

  return (
    <div className="page">
      <div className="nav-top"><button className="back" onClick={() => nav(-1)}><Icon name="chevL" /> Retour</button></div>
      <div className="header" style={{ marginTop: 0 }}><h1>Réglages</h1></div>

      {!standalone && (
        <div className="banner blue">
          <span style={{ fontSize: 22 }}>📲</span>
          <span>Installez l'app : dans Safari, touchez <b>Partager</b> puis <b>« Sur l'écran d'accueil »</b>. Elle s'ouvrira en plein écran et fonctionnera hors connexion.</span>
        </div>
      )}

      <div className="section-title">Sauvegarde</div>
      <div className="list">
        <div className="row"><div className="grow"><div className="title">Enregistrement automatique</div><div className="meta">Chaque série est enregistrée sur l'appareil dès sa saisie</div></div><span className="chip up">Actif</span></div>
        <div className="row">
          <div className="grow"><div className="title">Stockage persistant</div><div className="meta">{persisted ? 'Le navigateur ne purgera pas vos données' : 'Recommandé pour éviter toute purge automatique'}{usage ? ` · ${usage}` : ''}</div></div>
          {persisted ? <span className="chip up">Oui</span> : <button className="btn sm" onClick={async () => { const ok = await requestPersistence(); setPersisted(ok); toast(ok ? 'Stockage persistant activé' : "Installez l'app sur l'écran d'accueil pour l'activer"); }}>Activer</button>}
        </div>
        <div className="row"><div className="grow"><div className="title">Données</div><div className="meta">{counts ? `${counts.w} séances · ${counts.s} séries · ${counts.e} exercices` : '…'}</div></div></div>
      </div>

      <div className="section-title">Exporter</div>
      {lastExport !== undefined && (Date.now() - lastExport > 7 * 86400000) && (
        <div className="banner">⚠️ {lastExport ? `Dernier export il y a ${Math.round((Date.now() - lastExport) / 86400000)} jours.` : 'Aucun export effectué.'} Exportez régulièrement vers iCloud Drive pour une sécurité maximale.</div>
      )}
      <div className="list">
        <button className="row pressable" onClick={() => exportJSON().then(() => toast('Sauvegarde exportée'))}>
          <Icon name="download" /><div className="grow"><div className="title">Sauvegarde complète (JSON)</div><div className="meta">Restaurable · « Enregistrer dans Fichiers » → iCloud Drive</div></div><Icon name="chevR" size={18} />
        </button>
        <button className="row pressable" onClick={() => exportCSV()}>
          <Icon name="download" /><div className="grow"><div className="title">Historique (CSV)</div><div className="meta">Pour Excel / Numbers</div></div><Icon name="chevR" size={18} />
        </button>
      </div>

      <div className="section-title">Restaurer</div>
      <div className="list">
        <button className="row pressable" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" /><div className="grow"><div className="title">Importer une sauvegarde</div><div className="meta">Fichier .json exporté depuis Overload (autre appareil, iCloud…)</div></div><Icon name="chevR" size={18} />
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try { setPending(await readBackupFile(f)); } catch (err) { toast((err as Error).message); }
      }} />

      {snapshots && snapshots.length > 0 && (
        <>
          <div className="section-title" style={{ fontSize: 17 }}>Points de restauration automatiques</div>
          <div className="list">
            {snapshots.map((s) => (
              <button key={s.id} className="row pressable" onClick={() => setPending(JSON.parse(s.data))}>
                <div className="grow"><div className="title">{relativeDay(toISO(new Date(s.createdAt)))} · {new Date(s.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="meta">{(JSON.parse(s.data) as BackupFile).data.workouts.length} séances</div></div>
                <Icon name="chevR" size={18} />
              </button>
            ))}
          </div>
          <p className="small muted mt" style={{ padding: '0 4px' }}>Créés à chaque fin de séance et une fois par jour (10 derniers conservés, sur cet appareil).</p>
        </>
      )}

      <div className="section-title">Séance</div>
      <div className="list">
        <div className="row">
          <div className="grow"><div className="title">Temps de repos</div><div className="meta">Minuteur après chaque série validée (désactivé par défaut)</div></div>
          <select className="input" style={{ width: 110, height: 38 }} value={rest} onChange={async (e) => { const v = Number(e.target.value); setRest(v); await setMeta('restSeconds', v); }}>
            <option value={0}>Désactivé</option>
            {[30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map((s) => <option key={s} value={s}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</option>)}
          </select>
        </div>
      </div>

      <p className="small muted mt2" style={{ textAlign: 'center' }}>Overload v1.0 · données stockées localement sur cet appareil</p>

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Restaurer">
        {pending && (
          <>
            <p className="muted">Sauvegarde du {new Date(pending.exportedAt).toLocaleString('fr-FR')} : <b style={{ color: 'var(--text)' }}>{pending.data.workouts.length} séances, {pending.data.sets.length} séries</b>.</p>
            <p className="small muted mt">Un point de restauration de l'état actuel est créé automatiquement avant l'opération.</p>
            <button className="btn primary block mt2" onClick={async () => { await restoreBackup(pending, 'merge'); setPending(null); toast('Données fusionnées ✓'); }}>Fusionner avec mes données</button>
            <button className="btn danger block mt" onClick={async () => { if (!confirm('Remplacer TOUTES les données actuelles par cette sauvegarde ?')) return; await restoreBackup(pending, 'replace'); setPending(null); toast('Sauvegarde restaurée ✓'); }}>Remplacer toutes mes données</button>
          </>
        )}
      </Sheet>
    </div>
  );
}
