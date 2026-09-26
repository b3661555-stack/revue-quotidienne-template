"""Adds camera/photo/location permission texts to the iOS project (15 languages) and the
Android manifest. Idempotent: safe to re-run after `npx cap add`."""
import os, re, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# (camera, photo library, location when in use)
TEXTS = {
 'en': ('Chatdex uses the camera to photograph the cats you meet.', 'Chatdex lets you pick a cat photo from your library.', 'Chatdex uses your approximate location to place cats on the map and show cats near you. Your exact position is never stored.'),
 'fr': ('Chatdex utilise l’appareil photo pour photographier les chats que tu croises.', 'Chatdex te permet de choisir une photo de chat dans ta photothèque.', 'Chatdex utilise ta position approximative pour placer les chats sur la carte et te montrer ceux qui sont proches. Ta position exacte n’est jamais enregistrée.'),
 'de': ('Chatdex nutzt die Kamera, um Katzen zu fotografieren, denen du begegnest.', 'Mit Chatdex kannst du ein Katzenfoto aus deiner Mediathek auswählen.', 'Chatdex nutzt deinen ungefähren Standort, um Katzen auf der Karte zu zeigen. Dein genauer Standort wird nie gespeichert.'),
 'it': ('Chatdex usa la fotocamera per fotografare i gatti che incontri.', 'Chatdex ti permette di scegliere la foto di un gatto dalla tua libreria.', 'Chatdex usa la tua posizione approssimativa per mostrare i gatti sulla mappa e quelli vicini a te. La tua posizione esatta non viene mai salvata.'),
 'es': ('Chatdex usa la cámara para fotografiar los gatos que encuentras.', 'Chatdex te permite elegir una foto de gato de tu fototeca.', 'Chatdex usa tu ubicación aproximada para situar los gatos en el mapa y mostrarte los cercanos. Tu ubicación exacta nunca se guarda.'),
 'pt': ('O Chatdex usa a câmera para fotografar os gatos que você encontra.', 'O Chatdex permite escolher uma foto de gato da sua fototeca.', 'O Chatdex usa sua localização aproximada para mostrar gatos no mapa e perto de você. Sua posição exata nunca é armazenada.'),
 'ru': ('Chatdex использует камеру, чтобы фотографировать встреченных котов.', 'Chatdex позволяет выбрать фото кота из твоей медиатеки.', 'Chatdex использует твоё приблизительное местоположение, чтобы показывать котов на карте и рядом с тобой. Точное местоположение никогда не сохраняется.'),
 'tr': ('Chatdex, karşılaştığın kedileri fotoğraflamak için kamerayı kullanır.', 'Chatdex, galerinden bir kedi fotoğrafı seçmeni sağlar.', 'Chatdex, kedileri haritada ve yakınında göstermek için yaklaşık konumunu kullanır. Tam konumun asla kaydedilmez.'),
 'ar': ('يستخدم Chatdex الكاميرا لتصوير القطط التي تصادفها.', 'يتيح لك Chatdex اختيار صورة قطة من مكتبة الصور.', 'يستخدم Chatdex موقعك التقريبي لعرض القطط على الخريطة والقريبة منك. لا يتم حفظ موقعك الدقيق أبدًا.'),
 'hi': ('Chatdex आपकी मिलने वाली बिल्लियों की फ़ोटो लेने के लिए कैमरे का उपयोग करता है।', 'Chatdex से आप अपनी लाइब्रेरी से बिल्ली की फ़ोटो चुन सकते हैं।', 'Chatdex बिल्लियों को मैप पर और आपके आस-पास दिखाने के लिए आपके अनुमानित स्थान का उपयोग करता है। आपका सटीक स्थान कभी सेव नहीं होता।'),
 'bn': ('আপনি যে বিড়ালগুলো দেখেন সেগুলোর ছবি তুলতে Chatdex ক্যামেরা ব্যবহার করে।', 'Chatdex দিয়ে আপনি লাইব্রেরি থেকে বিড়ালের ছবি বেছে নিতে পারেন।', 'মানচিত্রে ও আপনার কাছাকাছি বিড়াল দেখাতে Chatdex আপনার আনুমানিক অবস্থান ব্যবহার করে। আপনার সঠিক অবস্থান কখনো সংরক্ষণ করা হয় না।'),
 'zh-Hans': ('Chatdex 使用相机拍摄你遇到的猫咪。', 'Chatdex 允许你从相册中选择猫咪照片。', 'Chatdex 使用你的大致位置在地图上显示猫咪和附近的猫咪。你的精确位置从不会被保存。'),
 'ja': ('Chatdexは出会ったネコを撮影するためにカメラを使用します。', 'Chatdexではライブラリからネコの写真を選べます。', 'Chatdexはおおよその位置情報を使って、地図上や近くのネコを表示します。正確な位置は保存されません。'),
 'ko': ('Chatdex는 만난 고양이를 촬영하기 위해 카메라를 사용해요.', 'Chatdex에서 사진 보관함의 고양이 사진을 선택할 수 있어요.', 'Chatdex는 대략적인 위치를 사용해 지도와 주변의 고양이를 보여줘요. 정확한 위치는 절대 저장되지 않아요.'),
 'id': ('Chatdex menggunakan kamera untuk memotret kucing yang kamu temui.', 'Chatdex memungkinkanmu memilih foto kucing dari galeri.', 'Chatdex menggunakan perkiraan lokasimu untuk menampilkan kucing di peta dan di dekatmu. Lokasi persismu tidak pernah disimpan.'),
}
KEYS = ('NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSLocationWhenInUseUsageDescription')
esc = lambda s: s.replace('\\', '\\\\').replace('"', '\\"')

# --- iOS: base Info.plist keys (English)
plist_path = os.path.join(ROOT, 'ios/App/App/Info.plist')
plist = open(plist_path, encoding='utf-8').read()
for key, text in zip(KEYS, TEXTS['en']):
    if f'<key>{key}</key>' not in plist:
        plist = plist.replace('<dict>\n', f'<dict>\n\t<key>{key}</key>\n\t<string>{text}</string>\n', 1)
if '<key>CFBundleAllowMixedLocalizations</key>' not in plist:
    plist = plist.replace('<dict>\n', '<dict>\n\t<key>CFBundleAllowMixedLocalizations</key>\n\t<true/>\n', 1)
open(plist_path, 'w', encoding='utf-8').write(plist)

# --- iOS: InfoPlist.strings per language + Xcode project entries
pbx_path = os.path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj')
pbx = open(pbx_path, encoding='utf-8').read()
uid = lambda seed: hashlib.md5(seed.encode()).hexdigest()[:24].upper()
group_id, build_id = uid('InfoPlist.strings group'), uid('InfoPlist.strings build')
refs = []
for lang, texts in TEXTS.items():
    d = os.path.join(ROOT, f'ios/App/App/{lang}.lproj')
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'InfoPlist.strings'), 'w', encoding='utf-8') as f:
        f.write('/* Permission prompts shown by iOS. Generated by scripts/native-permissions.py */\n')
        f.write('"CFBundleDisplayName" = "Chatdex";\n')
        for key, text in zip(KEYS, texts):
            f.write(f'"{key}" = "{esc(text)}";\n')
    refs.append((uid(f'InfoPlist.strings {lang}'), lang))
if group_id not in pbx:
    pbx = pbx.replace('/* End PBXBuildFile section */',
        f'\t\t{build_id} /* InfoPlist.strings in Resources */ = {{isa = PBXBuildFile; fileRef = {group_id} /* InfoPlist.strings */; }};\n/* End PBXBuildFile section */')
    files = ''.join(f'\t\t{r} /* {l} */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = {l}; path = {l}.lproj/InfoPlist.strings; sourceTree = "<group>"; }};\n' for r, l in refs)
    pbx = pbx.replace('/* End PBXFileReference section */', files + '/* End PBXFileReference section */')
    children = ''.join(f'\t\t\t\t{r} /* {l} */,\n' for r, l in refs)
    pbx = pbx.replace('/* End PBXVariantGroup section */',
        f'\t\t{group_id} /* InfoPlist.strings */ = {{\n\t\t\tisa = PBXVariantGroup;\n\t\t\tchildren = (\n{children}\t\t\t);\n\t\t\tname = InfoPlist.strings;\n\t\t\tsourceTree = "<group>";\n\t\t}};\n/* End PBXVariantGroup section */')
    pbx = re.sub(r'(504EC3101FED79650016851F /\* LaunchScreen.storyboard \*/,\n)', r'\1' + f'\t\t\t\t{group_id} /* InfoPlist.strings */,\n', pbx, count=1)
    pbx = pbx.replace('\t\t\t\t504EC30D1FED79650016851F /* Main.storyboard in Resources */,\n',
        f'\t\t\t\t504EC30D1FED79650016851F /* Main.storyboard in Resources */,\n\t\t\t\t{build_id} /* InfoPlist.strings in Resources */,\n')
    regions = ''.join(f'\t\t\t\t{l if "-" not in l else chr(34) + l + chr(34)},\n' for l in TEXTS if l != 'en')
    pbx = pbx.replace('\t\t\tknownRegions = (\n\t\t\t\ten,\n\t\t\t\tBase,\n', '\t\t\tknownRegions = (\n\t\t\t\ten,\n\t\t\t\tBase,\n' + regions)
    open(pbx_path, 'w', encoding='utf-8').write(pbx)

# --- Android permissions
man_path = os.path.join(ROOT, 'android/app/src/main/AndroidManifest.xml')
man = open(man_path, encoding='utf-8').read()
for perm in ('android.permission.CAMERA', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'):
    if perm not in man:
        man = man.replace('<uses-permission android:name="android.permission.INTERNET" />',
                          f'<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="{perm}" />')
if 'android.hardware.camera' not in man:
    man = man.replace('</manifest>', '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>')
open(man_path, 'w', encoding='utf-8').write(man)
print('Native permissions configured for', len(TEXTS), 'languages.')
