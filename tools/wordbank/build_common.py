#!/usr/bin/env python3
"""Builds js/wordbank-common.js: common English words in five frequency bands.

  python3 tools/wordbank/build_common.py

Source: wordfreq's English list (most used first). A word stays when it is lower-case
letters only, has a vowel, and hunspell's en_US dictionary (or the web2 word list)
knows it in lower case, so names, places and brands drop out. The blocklists below
remove sexual, violent, drug and swear words, slurs and brand names. The sexual words,
swear words and slurs are stored in ROT13 so they don't sit in the repo as plain text.
"""
import codecs, json, os, re
import wordfreq
from english_words import get_english_words_set

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'js', 'wordbank-common.js')
BANDS = [1000, 1500, 2000, 2000, 1500]          # words per band, most common first
LONG = 900                                      # extra long words (9 to 14 letters) past the bands

def forms(stems):
    out = set()
    for s in stems.split():
        out.update({s, s + 's', s + 'es', s + 'ed', s + 'ing', s + 'er', s + 'ers', s + 'ings'})
        if s.endswith('e'): out.update({s + 'd', s[:-1] + 'ing', s[:-1] + 'er', s[:-1] + 'ers'})
        if re.search(r'[^aeiou][aeiou][bdgmnprt]$', s): out.update({s + s[-1] + 'ed', s + s[-1] + 'ing'})
    return out

VIOLENT = forms('kill murder gun shoot shooter stab bomb bomber terror terrorist terrorism weapon suicide assault abuse abusive '
    'torture massacre slaughter rifle pistol bullet shotgun missile grenade ammo hostage kidnap assassin assassination '
    'genocide holocaust nazi slave slavery racist racism corpse dead deadly death die died dies blood bloody knife '
    'stabbing strangle behead execute execution warfare war wars warrior warriors fight fighter punch beat beaten '
    'harassment harass hate hatred victim violent violence wound wounded injury injured cruel poison explosive '
    'shotguns cannon militia soldier troops invade invasion sniper gunfire')
DRUGS = forms('drug cocaine heroin marijuana cannabis meth weed alcohol alcoholic drunk drunken beer wine vodka whiskey '
    'cocktail booze tobacco cigarette cigar smoke smoking vape casino gamble gambling bet betting opioid overdose '
    'liquor rum tequila hangover pills stoned')
BRANDS = set('google facebook twitter youtube instagram iphone ipad android amazon netflix microsoft samsung nike adidas '
    'pepsi coke mcdonald disney nintendo playstation xbox sony tesla uber lego ebay paypal spotify tiktok snapchat '
    'whatsapp linux windows xerox velcro kleenex jacuzzi frisbee taser lycra botox styrofoam photoshop skype zoom '
    'walmart starbucks reddit gmail yahoo intel nvidia dell lenovo toyota honda ford ferrari bmw kindle tinder '
    'twitch discord roblox minecraft fortnite pokemon marvel'.split())
# sexual words, swear words and slurs, ROT13
HIDDEN = forms(codecs.decode(
    'frk frkhny frkhnyyl frkl frkhnyvgl cbea cbeab cbeabtencul ahqr anxrq rebgvp betnfz oernfg oernfgf obbo obbof qvpx '
    'pbpx chffl ubeal xvaxl srgvfu cebfgvghgr cebfgvghgvba ubbxre fgevccre pbaqbz ivnten znfgheongr yrfovna tnl tnlf '
    'ubzbfrkhny ubzbfrkhnyvgl ovfrkhny fyhg jubber ovgpu onfgneq qnza tbqqnza uryy penc fuvg fuvggl ohyyfuvg shpx '
    'shpxvat shpxrq shpxva shpxre nff nffubyr nffrf onqnff cvff cvffrq encr encrq encvfg zbyrfg jnax ubr '
    'yhfg zvfgerff ivetva fcrez frzra ahqvgl fgevc fgevcf fgevccrq rebgvpn avttre avttn snt snttbg erg'
    'neq fcvp puvax xvxr jrgonpx ergneqrq pbba tbbx fdhnj', 'rot13'))
# short forms, chat words and fragments that pass the dictionary
SKIP = set('mr mrs ms dr st etc vs ie eg ok lol haha hmm uh um ah oh yeah ya yep nope gonna gotta wanna kinda dont im ive '
    'id ill ve ll re pre http www com org gov edu tv pc uk us eu un da le la el de du ne en ad ex al ii iii pm am '
    'jr sr co inc ltd feb jan apr aug sept oct nov dec mon tue wed thu fri sat sun'.split())
NAMES = set('john york china trump smith peter tom jack louis mike frank henry martin lee harry tony bob don nick brazil hong lewis '
    'jews jew jimmy kelly charlie jane roger berlin oxford anna phil johnny josh billy maria del graham carl nelson terry ted '
    'jerry warren cooper khan perry charlotte franklin ken batman superman bobby turner sandy cole earl chuck kent benjamin '
    'manhattan collins morris kyle nancy murphy brad potter shaw bailey ruth logan hart marc geneva java tits fisher jenny '
    'troy lynch newton randy joey gilbert griffin homer hon teddy burke glen maya molly mickey baptist catholic catholics '
    'protestant christian christians evangelical democrat democrats dems communist communists communism confederate afghan '
    'argentine danish dutch welsh french english german germans shanghai manila panama vikings apollo timothy wellington '
    'mafia frankfurt lang ana cos col chi mac las sec min mins ave cam atm asap abs prof rev jun nah cant gal wright mar pic '
    'jean ann rick dan sam ben tim jim alex chris kim max ray rose jay pat sue eve doe victor victoria phoenix jersey '
    'trans hmm bro dude yo sis mom mommy daddy kinda sorta lmao omg btw idk tbh wtf'.split())
# Contractions with the apostrophe dropped (wordfreq lists "didn't" as "didnt"): they read as misspellings, so they go.
# Real words that happen to match a contraction (ill, well, were, its, lets, shell, wed, hell, shed, id) stay.
CONTRACTIONS = set('dont cant wont didnt doesnt isnt arent wasnt werent hasnt havent hadnt couldnt wouldnt shouldnt mustnt '
    'neednt aint im ive youre youve youll youd theyre theyve theyll theyd weve thats whats whos wheres theres heres '
    'hows whys whens itll itd shes hes thatll thered whatre yall gonna wanna gotta'.split())
TWO = set('of to in it is be as at so we he by or on do if me my up an go no am'.split())

def main():
    dic = open('/usr/share/hunspell/en_US.dic', encoding='utf-8', errors='ignore').read().split('\n')[1:]
    low = {l.split('/')[0] for l in dic if l and l[0].islower()}
    cap = {l.split('/')[0].lower() for l in dic if l and l[0].isupper()}
    web2 = {w for w in get_english_words_set(['web2'], lower=False) if w.islower()}
    def known(w):
        if w in low: return True
        if w in cap: return False
        if w in web2: return True
        for s in ('s', 'es', 'ed', 'd', 'ing', 'er', 'ers', 'est', 'ly', 'ies', 'ied', 'ier', 'iest', 'ness', 'ment', 'ments'):
            if w.endswith(s) and len(w) - len(s) >= 3:
                b = w[:-len(s)]
                for c in (b, b + 'e', b + 'y', b[:-1] if b[-1:] == b[-2:-1] else None):
                    if c and (c in low or (c in web2 and c not in cap)): return True
        return False
    block = VIOLENT | DRUGS | BRANDS | HIDDEN | SKIP | NAMES | CONTRACTIONS
    words = []
    for w in wordfreq.top_n_list('en', 40000):
        if not re.fullmatch('[a-z]{2,14}', w) or w in block: continue
        if len(w) == 2 and w not in TWO: continue
        if not re.search('[aeiouy]', w) or not known(w): continue
        words.append(w)
    bands, i = [], 0
    for n in BANDS:
        bands.append(words[i:i + n]); i += n
    rest = [w for w in words[i:] if len(w) >= 9][:LONG]
    data = {'bands': bands, 'long': rest}
    with open(OUT, 'w') as f:
        f.write('// Generated by tools/wordbank/build_common.py from wordfreq\'s English list. Do not edit by hand.\n')
        f.write('// bands[0] holds the 1000 most used words, bands[4] the least used. long holds 9 to 14 letter words past the bands.\n')
        f.write('window.WORDBANK_COMMON = {\n')
        f.write('"bands":[\n' + ',\n'.join('"' + ' '.join(b) + '"' for b in bands) + '],\n')
        f.write('"long":"' + ' '.join(rest) + '"};\n')
    print('bands', [len(b) for b in bands], 'long', len(rest), 'total', sum(map(len, bands)) + len(rest))
    print('kB', round(os.path.getsize(OUT) / 1024))

if __name__ == '__main__':
    main()
