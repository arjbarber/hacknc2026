export type Language = 'en' | 'tr'

const en = {
  sayWow: 'Say wow to enter ♡', opening: 'Opening portal…', wowOpening: 'WOW certified ✦ opening portal…',
  mic: 'Use microphone', requesting: 'Requesting…', listening: 'Listening…', openPhone: 'Open phone', closePhone: 'Close phone',
  unsupported: 'Voice recognition is unavailable in this browser — open in Chrome or use manual entry.',
  miss: 'That was insufficiently impressive. Try again.', missThree: 'The phone is beginning to question your enthusiasm.',
  loading: 'Loading dream world…', warming: 'Warming up the phone…', language: 'Language', english: 'English', turkish: 'Türkçe',
  welcomeTitle: 'welcomes you', welcomeHeading: 'Welcome to absolutely nothing.', welcomeBody: 'Your aquatic productivity suite is ready to waste your time.',
  desktopApps: 'Desktop applications', player: 'Player', playerNote: 'emotionally available audio', supportFish: 'Support Fish', supportNote: 'certified-ish assistance',
  weather: 'Weather.exe', weatherNote: 'currently: damp', settings: 'Settings', settingsNote: 'fish are deciding', help: 'Help!', helpNote: 'summons a dolphin',
  close: 'Close', quit: 'I quit', callingGemini: 'calling Gemini…', sayAgain: '▶ say it again', pickLocation: 'Pick a location', locationPlaceholder: 'Somewhere, probably', checkWeather: 'Check weather', forecast: 'it is probably hot or cold, maybe wet idk',
  settingsError: 'Error 505: vivecoder.exe ran out of tokens', helpMessage: 'put it in rice idk', resetDemo: '↻ Demo reset', openMenu: 'Open CallMeMaybe menu',
  playerEdition: 'Player — emotionally available edition', closePlayer: 'Close CallMeMaybe Player', dolphinDrive: 'NOW IN THE DOLPHIN DRIVE', chooseAudio: 'Choose audio file', trackProgress: 'Track progress',
  play: 'Play', pause: 'Pause?', unmute: 'Unmute', emergencyMute: 'Emergency mute', reset: 'Reset', chaos: 'Chaos', on: 'On', off: 'Off', safeVolume: 'Safe volume', cap: '(cap 65%)',
  fishCatcher: 'Fish Catcher™', catchFish: 'Catch a licensed volume fish.', bubbleInflation: 'Bubble Inflation™', inflateHint: 'Hold to inflate. Nothing bad will happen.', holdInflate: 'Hold to inflate',
  playerInitial: 'Please insert one legally obtainable banger.', muted: 'Emergency mute respected. Chaos has been legally restrained.', invalidAudio: 'That file is insufficiently musical.', trackAccepted: 'Track accepted. Copyright lawyers remain calm.', selectAudio: 'Select your own audio file first. Piracy is not very aquatic.', nowPlaying: 'Now playing at a responsibly chaotic volume.', playBlocked: 'The browser declined our musical ambitions. Try Play again.',
  forgiven: 'I forgive you. Eventually.', paused: 'Paused. The CD is processing this rejection.', playerReset: 'Player reset. It remembers everything.', pop: 'POP! Volume reset to 1%. The bubble has filed a complaint.', sliderBoundaries: 'The slider has boundaries. Please respect them.', chaosBack: 'Chaos is back from lunch.', chaosOff: 'Chaos Off. Your boundaries are valid.', opposite: 'Excellent choice. I have selected the opposite.', soundAgain: 'Fine. You may have sound again.',
  oceanVolume: (n: number) => `The ocean has adjusted volume to ${n}% on your behalf.`, caughtFish: (n: number) => `Caught a ${n}% fish. It seems surprised.`, setVolume: (n: number) => `Set volume to ${n} percent`,
  mad: 'Are you mad at me?', pauseNotice: 'The CD noticed you tried to pause it.', perfect: "No, you're perfect.", ears: "It's not you, it's my ears.", pauseDialog: 'Emotional pause confirmation', achievement: '🏆 Pointless achievement',
  silenceAchievement: 'Silence Is Golden-ish', emotionalAchievement: 'Emotionally Available', bubbleAchievement: 'Professional Bubble Liability', sliderAchievement: 'Slider Chaser', fishAchievement: 'Master Baiter of Volume',
  micDenied: 'Microphone access denied. Allow it in site settings or use manual entry.', speechBlocked: 'Speech recognition is blocked by this browser. Use Chrome or manual entry.', noMic: 'No working microphone was found. Check your input device and try again.', noSpeech: 'I heard only mysterious ocean silence. Try saying “wow” again.', speechNetwork: 'Speech recognition could not reach its service. Manual entry still works offline.', micBusy: 'The microphone is already busy. Wait a moment and try again.', speechStopped: (error: string) => `Speech recognition stopped (${error}). Manual entry still works.`,
}

export type Translation = { [K in keyof typeof en]: typeof en[K] extends (...args: infer A) => string ? (...args: A) => string : string }

const tr: Translation = {
  sayWow: 'Girmek için “vay” de ♡', opening: 'Portal açılıyor…', wowOpening: 'VAY onaylandı ✦ portal açılıyor…',
  mic: 'Mikrofonu kullan', requesting: 'İzin isteniyor…', listening: 'Dinleniyor…', openPhone: 'Telefonu aç', closePhone: 'Telefonu kapat',
  unsupported: 'Bu tarayıcı ses tanımayı desteklemiyor — Chrome’da aç veya elle giriş yap.',
  miss: 'Bu yeterince etkileyici değildi. Tekrar dene.', missThree: 'Telefon hevesini sorgulamaya başladı.',
  loading: 'Hayal dünyası yükleniyor…', warming: 'Telefon hazırlanıyor…', language: 'Dil', english: 'English', turkish: 'Türkçe',
  welcomeTitle: 'seni karşılıyor', welcomeHeading: 'Kesinlikle hiçbir şeye hoş geldin.', welcomeBody: 'Su altı üretkenlik paketin zamanını harcamaya hazır.',
  desktopApps: 'Masaüstü uygulamaları', player: 'Oynatıcı', playerNote: 'duygusal olarak erişilebilir ses', supportFish: 'Destek Balığı', supportNote: 'az çok sertifikalı destek',
  weather: 'HavaDurumu.exe', weatherNote: 'şimdilik: nemli', settings: 'Ayarlar', settingsNote: 'balıklar karar veriyor', help: 'Yardım!', helpNote: 'bir yunus çağırır',
  close: 'Kapat', quit: 'İstifa ediyorum', callingGemini: 'Gemini aranıyor…', sayAgain: '▶ tekrar söyle', pickLocation: 'Bir konum seç', locationPlaceholder: 'Bir yer, herhâlde', checkWeather: 'Havayı kontrol et', forecast: 'muhtemelen sıcak ya da soğuk, belki ıslak, bilmiyorum',
  settingsError: 'Hata 505: vivecoder.exe belirteçleri tükendi', helpMessage: 'pirince koy, bilmiyorum', resetDemo: '↻ Demoyu sıfırla', openMenu: 'CallMeMaybe menüsünü aç',
  playerEdition: 'Oynatıcı — duygusal olarak erişilebilir sürüm', closePlayer: 'CallMeMaybe Oynatıcıyı kapat', dolphinDrive: 'ŞİMDİ YUNUS SÜRÜCÜSÜNDE', chooseAudio: 'Ses dosyası seç', trackProgress: 'Parça ilerlemesi',
  play: 'Oynat', pause: 'Duraklat?', unmute: 'Sesi aç', emergencyMute: 'Acil sessiz', reset: 'Sıfırla', chaos: 'Kaos', on: 'Açık', off: 'Kapalı', safeVolume: 'Güvenli ses', cap: '(%65 sınır)',
  fishCatcher: 'Balık Yakalayıcı™', catchFish: 'Lisanslı bir ses balığı yakala.', bubbleInflation: 'Balon Şişirme™', inflateHint: 'Şişirmek için basılı tut. Kötü hiçbir şey olmayacak.', holdInflate: 'Şişirmek için tut',
  playerInitial: 'Yasal yoldan edinilmiş bir hit tak lütfen.', muted: 'Acil sessizliğe saygı duyuldu. Kaos yasal olarak dizginlendi.', invalidAudio: 'Bu dosya yeterince müzikal değil.', trackAccepted: 'Parça kabul edildi. Telif avukatları sakin.', selectAudio: 'Önce kendi ses dosyanı seç. Korsanlık pek sucul değil.', nowPlaying: 'Sorumlu ölçüde kaotik bir seste çalıyor.', playBlocked: 'Tarayıcı müzik hayallerimizi reddetti. Tekrar Oynat’a bas.',
  forgiven: 'Seni affediyorum. Eninde sonunda.', paused: 'Duraklatıldı. CD bu reddedilişi sindiriyor.', playerReset: 'Oynatıcı sıfırlandı. Her şeyi hatırlıyor.', pop: 'PAT! Ses %1’e döndü. Balon şikâyette bulundu.', sliderBoundaries: 'Kaydırıcının sınırları var. Lütfen saygı duy.', chaosBack: 'Kaos öğle arasından döndü.', chaosOff: 'Kaos Kapalı. Sınırların geçerli.', opposite: 'Harika seçim. Ben tersini seçtim.', soundAgain: 'Peki. Yeniden ses alabilirsin.',
  oceanVolume: (n: number) => `Okyanus sesi senin adına %${n} yaptı.`, caughtFish: (n: number) => `%${n} ses balığı yakalandı. Biraz şaşkın.`, setVolume: (n: number) => `Sesi yüzde ${n} yap`,
  mad: 'Bana kızgın mısın?', pauseNotice: 'CD onu duraklatmaya çalıştığını fark etti.', perfect: 'Hayır, sen mükemmelsin.', ears: 'Sorun sen değilsin, kulaklarım.', pauseDialog: 'Duygusal duraklatma onayı', achievement: '🏆 Gereksiz başarı',
  silenceAchievement: 'Sessizlik Altın Sayılır', emotionalAchievement: 'Duygusal Olarak Müsait', bubbleAchievement: 'Profesyonel Balon Sorumluluğu', sliderAchievement: 'Kaydırıcı Avcısı', fishAchievement: 'Ses Balığı Ustası',
  micDenied: 'Mikrofon izni reddedildi. Site ayarlarından izin ver veya elle giriş yap.', speechBlocked: 'Ses tanıma bu tarayıcıda engellendi. Chrome’u veya elle girişi kullan.', noMic: 'Çalışan mikrofon bulunamadı. Giriş aygıtını kontrol edip tekrar dene.', noSpeech: 'Yalnızca gizemli okyanus sessizliği duydum. Yeniden “vay” demeyi dene.', speechNetwork: 'Ses tanıma hizmetine ulaşılamadı. Elle giriş çevrimdışıyken de çalışır.', micBusy: 'Mikrofon zaten meşgul. Biraz bekleyip tekrar dene.', speechStopped: (error: string) => `Ses tanıma durdu (${error}). Elle giriş hâlâ çalışıyor.`,
}

export const translations = { en, tr }
