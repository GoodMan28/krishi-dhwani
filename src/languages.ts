export const LANG_CODES = ['hi-IN', 'en-IN', 'hi-en', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'pa-IN', 'ta-IN', 'te-IN'] as const;
export type LangCode = (typeof LANG_CODES)[number];

interface LangInfo { name: string; native: string; voice: string; ttsLang: string }

// Timbre v2.5 voice catalog (docs.gnani.ai/api/TTS/available-voices). Voice must match the model.
export const LANGS: Record<LangCode, LangInfo> = {
  'hi-IN': { name: 'Hindi', native: 'हिन्दी', voice: 'Nalini', ttsLang: 'hi-IN' },
  'en-IN': { name: 'English', native: 'English', voice: 'Kaveri', ttsLang: 'en-IN' },
  'hi-en': { name: 'Hinglish', native: 'Hinglish', voice: 'Poorvi', ttsLang: 'hi-en' },
  'bn-IN': { name: 'Bengali', native: 'বাংলা', voice: 'Kirra', ttsLang: 'bn-IN' },
  'gu-IN': { name: 'Gujarati', native: 'ગુજરાતી', voice: 'Falak', ttsLang: 'gu-IN' },
  'kn-IN': { name: 'Kannada', native: 'ಕನ್ನಡ', voice: 'Saanvi', ttsLang: 'kn-IN' },
  'ml-IN': { name: 'Malayalam', native: 'മലയാളം', voice: 'Reshma', ttsLang: 'ml-IN' },
  'mr-IN': { name: 'Marathi', native: 'मराठी', voice: 'Zahira', ttsLang: 'mr-IN' },
  'pa-IN': { name: 'Punjabi', native: 'ਪੰਜਾਬੀ', voice: 'Mehuli', ttsLang: 'pa-IN' },
  'ta-IN': { name: 'Tamil', native: 'தமிழ்', voice: 'Asmita', ttsLang: 'ta-IN' },
  'te-IN': { name: 'Telugu', native: 'తెలుగు', voice: 'Suhana', ttsLang: 'te-IN' },
};

// Timbre v3.0 voices speak every language; used when GNANI_TTS_MODEL=timbre-v3.0
export const V3_VOICE = 'Shivani';

export function isLang(x: unknown): x is LangCode {
  return typeof x === 'string' && (LANG_CODES as readonly string[]).includes(x);
}
export function normalizeLang(code: string | undefined, fallback: LangCode = 'hi-IN'): LangCode {
  return isLang(code) ? code : fallback;
}

/** Guess the language of typed text from its Unicode script. Devanagari defaults to Hindi. */
export function detectScript(text: string): LangCode | null {
  const ranges: [RegExp, LangCode][] = [
    [/[ঀ-৿]/, 'bn-IN'], [/[਀-੿]/, 'pa-IN'], [/[઀-૿]/, 'gu-IN'],
    [/[஀-௿]/, 'ta-IN'], [/[ఀ-౿]/, 'te-IN'], [/[ಀ-೿]/, 'kn-IN'],
    [/[ഀ-ൿ]/, 'ml-IN'], [/[ऀ-ॿ]/, 'hi-IN'],
  ];
  for (const [re, code] of ranges) if (re.test(text)) return code;
  if (/[a-z]/i.test(text)) {
    const hinglish = /\b(kya|hai|mera|meri|mere|kaise|karu|karun|kare|nahi|bahut|fasal|khet|paani|dawai|kab|kyun|aur|ka|ki|ke|me|mein)\b/i;
    return hinglish.test(text) ? 'hi-en' : 'en-IN';
  }
  return null;
}

type Msg = Record<LangCode, string>;
export const MSG: Record<'couldNotHear' | 'error' | 'unsupported' | 'welcome' | 'locationSaved' | 'notAPlant', Msg> = {
  couldNotHear: {
    'hi-IN': 'माफ़ कीजिए, आवाज़ साफ़ नहीं सुनाई दी। कृपया फिर से बोलकर भेजें।',
    'en-IN': "Sorry, I couldn't hear that clearly. Please send the voice note again.",
    'hi-en': 'Sorry, awaaz clear nahi aayi. Please dobara voice note bhejiye.',
    'bn-IN': 'দুঃখিত, পরিষ্কার শুনতে পাইনি। অনুগ্রহ করে আবার ভয়েস নোট পাঠান।',
    'gu-IN': 'માફ કરશો, અવાજ સ્પષ્ટ સંભળાયો નહીં. કૃપા કરીને ફરીથી વોઇસ નોટ મોકલો.',
    'kn-IN': 'ಕ್ಷಮಿಸಿ, ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ವಾಯ್ಸ್ ನೋಟ್ ಕಳುಹಿಸಿ.',
    'ml-IN': 'ക്ഷമിക്കണം, ശബ്ദം വ്യക്തമായി കേട്ടില്ല. ദയവായി വീണ്ടും വോയ്സ് നോട്ട് അയയ്ക്കൂ.',
    'mr-IN': 'माफ करा, आवाज स्पष्ट ऐकू आला नाही. कृपया पुन्हा व्हॉइस नोट पाठवा.',
    'pa-IN': 'ਮਾਫ਼ ਕਰਨਾ, ਆਵਾਜ਼ ਸਾਫ਼ ਨਹੀਂ ਸੁਣੀ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਵੌਇਸ ਨੋਟ ਭੇਜੋ।',
    'ta-IN': 'மன்னிக்கவும், குரல் தெளிவாகக் கேட்கவில்லை. தயவுசெய்து மீண்டும் குரல் செய்தி அனுப்புங்கள்.',
    'te-IN': 'క్షమించండి, మాట స్పష్టంగా వినిపించలేదు. దయచేసి మళ్ళీ వాయిస్ నోట్ పంపండి.',
  },
  error: {
    'hi-IN': 'माफ़ कीजिए, अभी कुछ दिक्कत है। कृपया एक मिनट बाद फिर कोशिश करें।',
    'en-IN': 'Sorry, something went wrong. Please try again in a minute.',
    'hi-en': 'Sorry, abhi kuch problem hai. Ek minute baad dobara try kijiye.',
    'bn-IN': 'দুঃখিত, এখন একটু সমস্যা হচ্ছে। এক মিনিট পরে আবার চেষ্টা করুন।',
    'gu-IN': 'માફ કરશો, હમણાં થોડી તકલીફ છે. એક મિનિટ પછી ફરી પ્રયાસ કરો.',
    'kn-IN': 'ಕ್ಷಮಿಸಿ, ಈಗ ಸ್ವಲ್ಪ ತೊಂದರೆ ಇದೆ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    'ml-IN': 'ക്ഷമിക്കണം, ഇപ്പോൾ ഒരു പ്രശ്നമുണ്ട്. ഒരു മിനിറ്റിന് ശേഷം വീണ്ടും ശ്രമിക്കൂ.',
    'mr-IN': 'माफ करा, सध्या काही अडचण आहे. एका मिनिटाने पुन्हा प्रयत्न करा.',
    'pa-IN': 'ਮਾਫ਼ ਕਰਨਾ, ਹੁਣੇ ਕੁਝ ਦਿੱਕਤ ਹੈ। ਇੱਕ ਮਿੰਟ ਬਾਅਦ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    'ta-IN': 'மன்னிக்கவும், இப்போது ஒரு சிக்கல் உள்ளது. ஒரு நிமிடம் கழித்து மீண்டும் முயற்சிக்கவும்.',
    'te-IN': 'క్షమించండి, ఇప్పుడు చిన్న సమస్య ఉంది. ఒక నిమిషం తర్వాత మళ్ళీ ప్రయత్నించండి.',
  },
  unsupported: {
    'hi-IN': 'कृपया अपना सवाल बोलकर (वॉइस नोट), फ़ोटो या टेक्स्ट में भेजें।',
    'en-IN': 'Please send your question as a voice note, a photo or text.',
    'hi-en': 'Please apna sawaal voice note, photo ya text mein bhejiye.',
    'bn-IN': 'অনুগ্রহ করে আপনার প্রশ্ন ভয়েস নোট, ছবি বা লেখায় পাঠান।',
    'gu-IN': 'કૃપા કરીને તમારો પ્રશ્ન વોઇસ નોટ, ફોટો અથવા લખાણમાં મોકલો.',
    'kn-IN': 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ವಾಯ್ಸ್ ನೋಟ್, ಫೋಟೋ ಅಥವಾ ಪಠ್ಯದಲ್ಲಿ ಕಳುಹಿಸಿ.',
    'ml-IN': 'ദയവായി നിങ്ങളുടെ ചോദ്യം വോയ്സ് നോട്ട്, ഫോട്ടോ അല്ലെങ്കിൽ ടെക്സ്റ്റ് ആയി അയയ്ക്കൂ.',
    'mr-IN': 'कृपया तुमचा प्रश्न व्हॉइस नोट, फोटो किंवा मजकुरात पाठवा.',
    'pa-IN': 'ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਸਵਾਲ ਵੌਇਸ ਨੋਟ, ਫੋਟੋ ਜਾਂ ਟੈਕਸਟ ਵਿੱਚ ਭੇਜੋ।',
    'ta-IN': 'உங்கள் கேள்வியை குரல் செய்தி, புகைப்படம் அல்லது எழுத்தாக அனுப்புங்கள்.',
    'te-IN': 'దయచేసి మీ ప్రశ్నను వాయిస్ నోట్, ఫోటో లేదా టెక్స్ట్‌గా పంపండి.',
  },
  welcome: {
    'hi-IN': 'मैं कृषि ध्वनि हूँ 🌾 अपनी फ़सल के बारे में कुछ भी बोलकर पूछिए। मौसम के हिसाब से सलाह के लिए अपना लोकेशन भेजें।',
    'en-IN': 'I am Krishi Dhwani 🌾 Ask me anything about your crops by voice. Share your location for weather-aware advice.',
    'hi-en': 'Main Krishi Dhwani hoon 🌾 Apni fasal ke baare mein kuch bhi bolkar poochiye. Mausam ke hisaab se salah ke liye location bhejiye.',
    'bn-IN': 'আমি কৃষি ধ্বনি 🌾 আপনার ফসল নিয়ে যেকোনো প্রশ্ন বলে জিজ্ঞাসা করুন। আবহাওয়া অনুযায়ী পরামর্শের জন্য লোকেশন পাঠান।',
    'gu-IN': 'હું કૃષિ ધ્વનિ છું 🌾 તમારા પાક વિશે કંઈપણ બોલીને પૂછો. હવામાન મુજબ સલાહ માટે તમારું લોકેશન મોકલો.',
    'kn-IN': 'ನಾನು ಕೃಷಿ ಧ್ವನಿ 🌾 ನಿಮ್ಮ ಬೆಳೆಯ ಬಗ್ಗೆ ಏನನ್ನಾದರೂ ಮಾತನಾಡಿ ಕೇಳಿ. ಹವಾಮಾನ ಆಧಾರಿತ ಸಲಹೆಗಾಗಿ ನಿಮ್ಮ ಸ್ಥಳ ಕಳುಹಿಸಿ.',
    'ml-IN': 'ഞാൻ കൃഷി ധ്വനി 🌾 നിങ്ങളുടെ വിളയെക്കുറിച്ച് എന്തും സംസാരിച്ച് ചോദിക്കൂ. കാലാവസ്ഥ അനുസരിച്ചുള്ള ഉപദേശത്തിന് ലൊക്കേഷൻ അയയ്ക്കൂ.',
    'mr-IN': 'मी कृषी ध्वनी आहे 🌾 तुमच्या पिकाबद्दल काहीही बोलून विचारा. हवामानानुसार सल्ल्यासाठी तुमचे लोकेशन पाठवा.',
    'pa-IN': 'ਮੈਂ ਕ੍ਰਿਸ਼ੀ ਧੁਨੀ ਹਾਂ 🌾 ਆਪਣੀ ਫ਼ਸਲ ਬਾਰੇ ਕੁਝ ਵੀ ਬੋਲ ਕੇ ਪੁੱਛੋ। ਮੌਸਮ ਅਨੁਸਾਰ ਸਲਾਹ ਲਈ ਆਪਣੀ ਲੋਕੇਸ਼ਨ ਭੇਜੋ।',
    'ta-IN': 'நான் கிருஷி த்வனி 🌾 உங்கள் பயிர் பற்றி எதையும் பேசிக் கேளுங்கள். வானிலைக்கு ஏற்ற ஆலோசனைக்கு உங்கள் இருப்பிடத்தை அனுப்புங்கள்.',
    'te-IN': 'నేను కృషి ధ్వని 🌾 మీ పంట గురించి ఏదైనా మాట్లాడి అడగండి. వాతావరణానికి తగిన సలహా కోసం మీ లొకేషన్ పంపండి.',
  },
  locationSaved: {
    'hi-IN': 'लोकेशन सेव हो गया ✅ अब सलाह में मौसम भी शामिल होगा।',
    'en-IN': 'Location saved ✅ Your advice will now include local weather.',
    'hi-en': 'Location save ho gaya ✅ Ab salah mein mausam bhi shamil hoga.',
    'bn-IN': 'লোকেশন সেভ হয়েছে ✅ এখন পরামর্শে আবহাওয়াও থাকবে।',
    'gu-IN': 'લોકેશન સેવ થયું ✅ હવે સલાહમાં હવામાન પણ સામેલ થશે.',
    'kn-IN': 'ಸ್ಥಳ ಉಳಿಸಲಾಗಿದೆ ✅ ಇನ್ನು ಮುಂದೆ ಸಲಹೆಯಲ್ಲಿ ಹವಾಮಾನವೂ ಇರುತ್ತದೆ.',
    'ml-IN': 'ലൊക്കേഷൻ സേവ് ചെയ്തു ✅ ഇനി ഉപദേശത്തിൽ കാലാവസ്ഥയും ഉൾപ്പെടും.',
    'mr-IN': 'लोकेशन सेव्ह झाले ✅ आता सल्ल्यात हवामानही असेल.',
    'pa-IN': 'ਲੋਕੇਸ਼ਨ ਸੇਵ ਹੋ ਗਈ ✅ ਹੁਣ ਸਲਾਹ ਵਿੱਚ ਮੌਸਮ ਵੀ ਸ਼ਾਮਲ ਹੋਵੇਗਾ।',
    'ta-IN': 'இருப்பிடம் சேமிக்கப்பட்டது ✅ இனி ஆலோசனையில் வானிலையும் இருக்கும்.',
    'te-IN': 'లొకేషన్ సేవ్ అయింది ✅ ఇకపై సలహాలో వాతావరణం కూడా ఉంటుంది.',
  },
  notAPlant: {
    'hi-IN': 'इस फ़ोटो में पौधा साफ़ नहीं दिख रहा। कृपया पत्ते या फ़सल की नज़दीक से फ़ोटो भेजें।',
    'en-IN': "I can't see a plant clearly in this photo. Please send a close-up of the leaf or crop.",
    'hi-en': 'Is photo mein paudha clear nahi dikh raha. Please patte ya fasal ki close-up photo bhejiye.',
    'bn-IN': 'এই ছবিতে গাছ পরিষ্কার দেখা যাচ্ছে না। পাতা বা ফসলের কাছ থেকে ছবি পাঠান।',
    'gu-IN': 'આ ફોટામાં છોડ સ્પષ્ટ દેખાતો નથી. કૃપા કરીને પાન અથવા પાકનો નજીકથી ફોટો મોકલો.',
    'kn-IN': 'ಈ ಫೋಟೋದಲ್ಲಿ ಗಿಡ ಸ್ಪಷ್ಟವಾಗಿ ಕಾಣುತ್ತಿಲ್ಲ. ಎಲೆ ಅಥವಾ ಬೆಳೆಯ ಹತ್ತಿರದ ಫೋಟೋ ಕಳುಹಿಸಿ.',
    'ml-IN': 'ഈ ഫോട്ടോയിൽ ചെടി വ്യക്തമായി കാണുന്നില്ല. ഇലയുടെയോ വിളയുടെയോ അടുത്തുനിന്നുള്ള ഫോട്ടോ അയയ്ക്കൂ.',
    'mr-IN': 'या फोटोत झाड स्पष्ट दिसत नाही. कृपया पानाचा किंवा पिकाचा जवळून फोटो पाठवा.',
    'pa-IN': 'ਇਸ ਫੋਟੋ ਵਿੱਚ ਪੌਦਾ ਸਾਫ਼ ਨਹੀਂ ਦਿਸ ਰਿਹਾ। ਕਿਰਪਾ ਕਰਕੇ ਪੱਤੇ ਜਾਂ ਫ਼ਸਲ ਦੀ ਨੇੜਿਓਂ ਫੋਟੋ ਭੇਜੋ।',
    'ta-IN': 'இந்தப் புகைப்படத்தில் செடி தெளிவாகத் தெரியவில்லை. இலை அல்லது பயிரின் அருகிலிருந்து எடுத்த படத்தை அனுப்புங்கள்.',
    'te-IN': 'ఈ ఫోటోలో మొక్క స్పష్టంగా కనిపించడం లేదు. ఆకు లేదా పంటను దగ్గరగా తీసిన ఫోటో పంపండి.',
  },
};
