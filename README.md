# Kripto İz

**E-postayla girip unuttuğun kripto projelerini ve oralarda kalan varlıklarını bul.**

🔗 Site: **https://turgayacar49.github.io/kripto-iz/**

Birçok kripto projesine e-postayla giriş yapıp deposit yapıyor, likidite ekliyor, sonra unutuyor musun? Kripto İz, Gmail arşivini tarayıp hangi projelere girdiğini listeler. Eklediğin cüzdan adreslerinde hâlâ ne kaldığını da gösterir.

> 🔒 **Gizlilik:** Mail dosyan tamamen kendi tarayıcında okunur, hiçbir sunucuya yüklenmez. Cüzdan listen sadece senin tarayıcında saklanır. Site hiçbir zaman özel anahtar veya seed phrase istemez.

---

## Neden e-posta?

Blokzincirdeki varlıklar e-postana değil **cüzdan adresine** bağlıdır. Ama e-postayla giriş yaptığın uygulamaların çoğu (Privy, Magic, Web3Auth, Dynamic gibi altyapılar kullananlar) arka planda senin için bir **gömülü cüzdan** açar ve bu cüzdan genellikle **her uygulamada farklı bir adrestir**. 10 projeye girdiysen 10 ayrı cüzdanın olabilir.

E-posta kutun ise hangi projelere girdiğinin en eksiksiz kaydı. Kripto İz bu kaydı kullanıp sana "şu projelere girmiştin, şuralara bak" der.

---

## Adım 1: Gmail arşivini indir

1. **[takeout.google.com](https://takeout.google.com)** adresini aç.
2. Sağ üstteki **"Tüm seçimleri iptal et"** yazısına tıkla.
3. Aşağı kaydır, sadece **"Posta"** satırını işaretle. Altındaki ayarlara dokunma (biçim `MBOX`, "Tüm Posta verileri dahil" kalsın).
4. En alta in, **"Sonraki adım"** butonuna bas.
5. Şunları seç:
   - Teslimat yöntemi: **İndirme bağlantısını e-postayla gönder**
   - Sıklık: **Bir kez dışa aktar**
   - Dosya türü: **.zip**
   - Dosya boyutu: **50 GB** (arşiv parçalara bölünmesin diye)
6. **"Dışa aktarma işlemi oluştur"** butonuna bas. Sayfayı kapatabilirsin, ama "Dışa aktarmayı iptal et"e basma.
7. Google arşivi hazırlayınca **"Google verileriniz indirilmeye hazır"** başlıklı bir mail gönderir. Bu birkaç saat, bazen bir iki gün sürer. Bağlantı yaklaşık **1 hafta** geçerlidir.
8. Zip'i indir, sağ tıklayıp **"Tümünü ayıkla"** de.
9. `Takeout/Posta/` klasöründe `.mbox` uzantılı büyük bir dosya olacak (adı "Tüm postalar..." gibi bir şey). Bunu bir sonraki adımda kullanacaksın.

> Outlook, Yahoo veya başka bir servis kullanıyorsan [Thunderbird](https://www.thunderbird.net) ile hesabını ekleyip klasörleri `.mbox` ya da `.eml` olarak dışa aktarabilirsin.

## Adım 2: Maillerini tara

1. **https://turgayacar49.github.io/kripto-iz/** adresini aç.
2. `.mbox` dosyasını **"1. E-postaları tara"** kutusuna sürükle ya da **"Dosya seç"** ile seç.
3. İlerleme çubuğu dolarken **sekmeyi kapatma**. 8 GB'lık bir arşiv birkaç dakika sürer.
4. Bitince **"2. Bulunan projeler"** bölümü dolar.

## Adım 3: Listeyi daralt

Yüzlerce proje çıkabilir. Bu sırayla ilerle:

1. **Tür: "Gömülü cüzdan".** En önemli kısım burası. E-postayla giriş yaptığın ve senin için cüzdan açılmış olabilecek uygulamalar burada.
2. **Etiket: "deposit", sonra "likidite", "stake", "vault".** Para yatırmış olabileceğin projeler.
3. **Tür: "Borsa".** Borsalardaki paran cüzdanda değil hesabında durur; siteye girip bakiyene bak.
4. İlgisiz olanlara **"Gizle"** de. Liste her seferinde kısalır.

Haber siteleri ve bültenler (Decrypt, CoinDesk, Substack...) varsayılan olarak gizlidir; "Haber / bülten" türünden görebilirsin.

## Adım 4: Cüzdan adreslerini ekle

Her önemli proje için:

1. Kartta **"Son mailler"e** tıklayıp ne olduğuna bak. "Deposit confirmed" gibi bir konu varsa öncelik ver.
2. Projenin sitesine git. Gömülü cüzdan kartlarında **"Siteyi ara"** linki var.
3. **Aynı e-postanla** giriş yap. Profil, Wallet ya da Account bölümünden `0x...` adresini kopyala.
4. Kripto İz'de o kartın **"Cüzdan adresi ekle"** butonuna basıp yapıştır.

Maillerde bir adres geçiyorsa kartta zaten görünür; **"Cüzdanlarıma ekle"** ile tek tıkla eklersin. Ama dikkat: bu adres senin cüzdanın da olabilir, bir token kontratı da.

## Adım 5: Bakiyeleri kontrol et

**"3. Cüzdanlarım"** bölümünde **"Hepsini kontrol et"** butonuna bas. Her cüzdan için şunlar gösterilir:

| Nerede | Neye bakılır |
| --- | --- |
| Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, HyperEVM | Ana coin, USDC, işlem sayısı |
| Hyperliquid | Perp hesap değeri, açık pozisyonlar, spot bakiyeler, **vault deposit'leri**, HYPE stake |
| Solana | SOL ve token bakiyeleri |

**Likidite (LP) ve diğer DeFi pozisyonları** için her cüzdanın yanındaki **DeBank** veya **Zerion** linkine tıkla. Bunları sayfanın içinde görmek istersen "4. Yedek ve ayarlar" bölümüne ücretsiz bir [Zerion API](https://developers.zerion.io) anahtarı ekleyebilirsin.

## Adım 6: Yedek al

Veriler sadece kullandığın tarayıcıda durur. **"4. Yedek ve ayarlar" → "Yedeği indir"** ile bir `.json` dosyası al. Başka bilgisayarda ya da tarayıcı verilerini sildikten sonra **"Yedek yükle"** ile geri getirirsin.

---

## Sık karşılaşılan sorunlar

**Tarama çok yavaş / sayfa dondu.** Tarama arka planda çalışır, sayfa donmamalı. Chrome, Edge veya Firefox'un güncel sürümünü kullan. Çok büyük arşivlerde bilgisayarın belleği yetmezse aşağıdaki "Terminalden tarama" yöntemini kullan.

**Bir zincirde "Ulaşılamayan" yazıyor.** O zincirin herkese açık sunucusu geçici olarak yanıt vermemiştir. Biraz sonra tekrar "Kontrol et". Antivirüs programların bazı adresleri engelleyebilir.

**Projenin adı yanlış ya da birden fazla uygulama tek kartta.** Giriş altyapısının (Privy, Particle...) mailinden uygulama adı her zaman çıkarılamıyor. "Son mailler"de konu satırlarına bak.

**Kripto ile ilgisiz göndericiler listede.** Algılama sezgiseldir. "Gizle" ile kaldır.

---

## Kendi bilgisayarında çalıştırmak (isteğe bağlı)

[Node.js](https://nodejs.org) 20 veya üstü gerekir.

```powershell
git clone https://github.com/TurgayAcar49/kripto-iz.git
cd kripto-iz
node serve.mjs
```

Sonra tarayıcıda **http://127.0.0.1:5178** adresini aç.

> Windows'ta `npm start` "betik çalıştırma devre dışı" hatası verirse doğrudan `node serve.mjs` kullan.

### Terminalden tarama

Çok büyük arşivler için taramayı terminalden yapıp sonucu siteye yükleyebilirsin:

```powershell
node scripts/scan.mjs "C:\yol\Tüm postalar.mbox" tarama.json
```

Ardından sitede **"Yedek yükle"** ile `tarama.json` dosyasını seç.

### Testler

```powershell
node --test
```

---

## Kendi kopyanı yayınlamak (GitHub Pages)

1. Bu repoyu **Fork** et.
2. Fork'ta **Settings → Pages** bölümüne git.
3. **Source: Deploy from a branch**, **Branch: `main`**, klasör **`/ (root)`** seç, **Save** de.
4. Birkaç dakika sonra site `https://KULLANICI-ADIN.github.io/kripto-iz/` adresinde yayında olur.

---

## Güvenlik

- **Seed phrase / kurtarma kelimelerini** asla bir siteye, uygulamaya ya da sohbete yapıştırma. Bilgisayarında düz metin dosyası olarak da tutma; kağıda yaz, güvenli yerde sakla.
- Bu site yalnızca **herkese açık** cüzdan adreslerini kullanır. Senden anahtar isteyen bir "Kripto İz" görürsen sahtedir.
- Bakiye sorguları için cüzdan adresin herkese açık RPC sağlayıcılarına (publicnode, dRPC, Hyperliquid) gönderilir. Mail içeriğin hiçbir yere gönderilmez.

## Proje yapısı

```
index.html        Sayfa
styles.css        Görünüm
js/app.js         Arayüz ve tarayıcı içi kayıt
js/worker.js      Mail dosyasını arka planda tarayan işçi
js/mail.js        Mail ayrıştırma ve kripto proje algılama
js/balances.js    Zincir üstü bakiye sorguları
js/storage.js     Tarayıcı kaydı, yedek indirme ve yükleme
serve.mjs         İsteğe bağlı yerel sunucu
scripts/scan.mjs  Terminalden tarama
test/             Testler
```
