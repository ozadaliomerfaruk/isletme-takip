YEDEKLENEN DOSYALAR - defterappv2
=================================
Tarih: 2026-05-23
Kaynak: c:\Users\ozada\apps\isletmetakip\defterappv2

=====================================================================
BOLUM 1: PROJE GIZLI DOSYALARI (Git'te yok, kaybedilirse geri gelmez)
=====================================================================

1. .env
   - Kaynak: defterappv2/.env
   - Icerigi: Supabase URL/key, Google OAuth client ID'leri, Apple ID/Team ID
   - Format sonrasi: proje kokune kopyala

2. google-service-account.json
   - Kaynak: defterappv2/google-service-account.json
   - Icerigi: Google Play Store service account anahtari
   - Format sonrasi: proje kokune kopyala

3. AuthKey_J2D248YY2D.p8
   - Kaynak: defterappv2/AuthKey_J2D248YY2D.p8
   - Icerigi: Apple Push Notification / App Store Connect ozel anahtari
   - UYARI: Apple Developer'dan sadece 1 kez indirilebilir!
   - Format sonrasi: proje kokune kopyala

4. @omerfarukozadali__isletmetakip-.jks
   - Kaynak: defterappv2/@omerfarukozadali__isletmetakip-.jks
   - Icerigi: Android keystore (uygulama imzalama anahtari)
   - KRITIK: Kaybolursa Play Store'a guncelleme yukleyemezsin!
   - Format sonrasi: proje kokune kopyala

5. @omerfarukozadali__isletmetakip-.bak.jks
   - Kaynak: defterappv2/@omerfarukozadali__isletmetakip-.bak.jks
   - Icerigi: Keystore yedegi
   - Format sonrasi: proje kokune kopyala

6. @omerfarukozadali__isletmetakip-_OLD_1.jks
   - Kaynak: defterappv2/@omerfarukozadali__isletmetakip-_OLD_1.jks
   - Icerigi: Eski keystore versiyonu
   - Format sonrasi: proje kokune kopyala

=====================================================================
BOLUM 2: CLAUDE CODE AYARLARI VE HAFIZASI
=====================================================================

claude-config/settings.json
   - Kaynak: C:\Users\ozada\.claude\settings.json
   - Icerigi: Claude model tercihi (opus-4-6), aktif pluginler, effort level
   - Format sonrasi: C:\Users\ozada\.claude\ altina kopyala

claude-config/settings.local.json
   - Kaynak: C:\Users\ozada\.claude\settings.local.json
   - Icerigi: Claude genel yerel ayarlar
   - Format sonrasi: C:\Users\ozada\.claude\ altina kopyala

claude-config/.mcp.json
   - Kaynak: C:\Users\ozada\.claude\.mcp.json
   - Icerigi: MCP server tanimlamalari (UnityMCP vs.)
   - Format sonrasi: C:\Users\ozada\.claude\ altina kopyala

claude-config/project-settings.local.json
   - Kaynak: defterappv2/.claude/settings.local.json
   - Icerigi: Proje bazli Claude izinleri (allowed bash commands vs.)
   - Format sonrasi: defterappv2/.claude/settings.local.json olarak kopyala

claude-project-memory/MEMORY.md
   - Kaynak: C:\Users\ozada\.claude\projects\c--Users-ozada-apps-isletmetakip-defterappv2\memory\MEMORY.md
   - Icerigi: Claude hafiza indeksi
   - Format sonrasi: ayni yola kopyala (proje yolu ayni kalirsa)

claude-project-memory/feedback_solo_founder_realistic_scope.md
   - Kaynak: C:\Users\ozada\.claude\projects\c--Users-ozada-apps-isletmetakip-defterappv2\memory\feedback_solo_founder_realistic_scope.md
   - Icerigi: Claude'un seni solo founder olarak tanima notu
   - Format sonrasi: ayni yola kopyala

=====================================================================
BOLUM 3: VSCODE AYARLARI
=====================================================================

vscode-config/settings.json
   - Kaynak: C:\Users\ozada\AppData\Roaming\Code\User\settings.json
   - Icerigi: Prettier, auto-save, icon theme, Python path, Copilot ayarlari
   - Format sonrasi: VSCode kurduktan sonra ayni yola kopyala

vscode-config/mcp.json
   - Kaynak: C:\Users\ozada\AppData\Roaming\Code\User\mcp.json
   - Icerigi: VSCode MCP server tanimlamalari
   - Format sonrasi: ayni yola kopyala

=====================================================================
BOLUM 4: GIT AYARLARI
=====================================================================

git-config/.gitconfig
   - Kaynak: C:\Users\ozada\.gitconfig
   - Icerigi: Git kullanici adi (Omer Faruk Ozadali), email, LFS ayarlari
   - Format sonrasi: C:\Users\ozada\.gitconfig olarak kopyala

git-config/known_hosts
   - Kaynak: C:\Users\ozada\.ssh\known_hosts
   - Icerigi: SSH bilinen sunucu anahtarlari
   - Format sonrasi: C:\Users\ozada\.ssh\known_hosts olarak kopyala
   - NOT: SSH private key bulunamadi, GitHub'a HTTPS ile baglaniyorsun

=====================================================================
FORMAT SONRASI ADIMLAR
=====================================================================
1. Git kur, GitHub'dan projeyi clone'la:
   git clone https://github.com/ozadaliomerfaruk/isletme-takip.git

2. Node.js kur (LTS), sonra:
   npm install -g eas-cli

3. Proje icinde:
   npm install

4. Bu klasordeki dosyalari yukaridaki konumlara geri kopyala

5. VSCode kur, Claude Code extension'i yukle

NOT: Kaynak kodun tamami GitHub'da, unpushed commit yok.
