import type { CloudArticle } from "../types";

// 下層雲（層積雲・層雲）の本文。
// 数値はすべて「典型的な大きさ」を示す概数で、近似式にはその旨を書いている。
export const lowClouds: CloudArticle[] = [
  {
    id: "stratocumulus",
    summary: String.raw`層積雲は、地表付近のよく混ざった空気の層（境界層）が、上空の逆転層にふたをされたところにできる低い雲です。観測にもとづく概数で年平均して地球表面の2割ほどを覆い、面積でいえば地球でいちばんありふれた雲で、とくに亜熱帯の大陸西岸沖の冷たい海の上に広大な雲の海をつくります。雲の中の対流を駆動しているのは地面の加熱ではなく、雲のてっぺんの放射冷却です。`,
    identify: [
      String.raw`灰色〜白の大きな塊やロールが、すき間をあけたりくっつき合ったりして並びます。ひとつの塊は空の高いところでも見かけの幅が $5^\circ$ 以上（腕を伸ばした指3本ぶんより大きい）あり、これより小さければ高積雲です。`,
      String.raw`塊の底は暗く、塊と塊のあいだから青空や明るい部分がのぞくことが多いです。`,
      String.raw`高さはおおむね $0.5$〜$2\,\mathrm{km}$ で、山の中腹にかかることもあります。`,
      String.raw`雨はほとんど降らず、降っても霧雨か弱い雨です。どんよりした曇りの日の雲の多くはこれです。`,
    ],
    sections: [
      {
        heading: "逆転層にふたをされた混合層",
        paragraphs: [
          String.raw`亜熱帯の高気圧の下では、上空の空気がゆっくり沈降しながら断熱圧縮で暖まり、高さ $1\,\mathrm{km}$ 前後に強い気温の逆転層ができます。その下の境界層は、乱流によって上から下までよくかき混ぜられた「混合層」になっています。`,
          String.raw`よく混ざった層では、空気塊が上下に動いても変わらない量が高さによらず一定になります。雲の中でも保存される量として、液水温位 $\theta_l$ と全水量 $q_t$ を使います。`,
        ],
        equations: [
          {
            tex: String.raw`\theta_l \approx \theta - \frac{\theta}{T}\frac{L_v}{c_p}\,q_l, \qquad q_t = q_v + q_l`,
            caption: "凝結しても蒸発しても変わらない、雲の中の保存量（近似形）",
          },
          {
            tex: String.raw`\frac{\partial \theta_l}{\partial z} = 0,\quad \frac{\partial q_t}{\partial z} = 0 \qquad (0 < z < z_i)`,
            caption: String.raw`混合層では $\theta_l$ と $q_t$ が高さによらない`,
          },
          {
            tex: String.raw`q_l(z) \approx \Gamma_l\,(z - z_b), \qquad \Gamma_l \approx 2\ \mathrm{g\,kg^{-1}\,km^{-1}}`,
            caption: "雲底より上では液水量がほぼ高さに比例して増える（断熱的な場合）",
          },
        ],
        after: [
          String.raw`$\theta$ は温位、$T$ は気温、$L_v \approx 2.5\times10^{6}\,\mathrm{J\,kg^{-1}}$ は蒸発の潜熱、$c_p \approx 1005\,\mathrm{J\,kg^{-1}\,K^{-1}}$ は定圧比熱、$q_v$ と $q_l$ は水蒸気と液水の混合比、$z_i$ は逆転層の高さ（雲頂）、$z_b$ は雲底の高さです。`,
          String.raw`$q_t$ が一定なので、持ち上げ凝結高度（LCL）は層のどこから持ち上げても同じになり、雲底は平らにそろいます。雲底より上では湿潤断熱減率で冷えるぶんだけ水蒸気が凝結し、$\Gamma_l$ は気温 $10^\circ\mathrm{C}$ 前後で約 $2\,\mathrm{g\,kg^{-1}\,km^{-1}}$ です。厚さ $300\,\mathrm{m}$ の雲なら雲頂で $q_l \approx 0.6\,\mathrm{g\,kg^{-1}}$ になりますが、実際には雲頂での混合のため断熱値よりやや小さいことが多いです。`,
          String.raw`逆転層をはさんで、温位はおよそ $5$〜$10\,\mathrm{K}$ 高く、全水量は数 $\mathrm{g\,kg^{-1}}$ 少なくなります。上は暖かく乾いた空気、下は冷たく湿った空気という、くっきりした二層構造です。`,
        ],
      },
      {
        heading: "雲頂の放射冷却が対流を起こす",
        paragraphs: [
          String.raw`雲粒をたくさん含む層は、赤外線に対してほぼ黒体としてふるまいます。雲頂の上には乾いて透明に近い空気しかないので、雲頂は宇宙に向かって赤外線を出すばかりで、上から返ってくる放射はわずかです。その結果、雲頂のごく薄い層（数十 m）で正味の上向き赤外放射フラックスが急に増え、そこが強く冷えます。`,
        ],
        equations: [
          {
            tex: String.raw`\frac{\partial T}{\partial t} = -\frac{1}{\rho c_p}\frac{\partial F}{\partial z}`,
            caption: "放射フラックスの発散による加熱率（冷却なら負）",
          },
          {
            tex: String.raw`\left|\frac{\partial T}{\partial t}\right| \approx \frac{\Delta F}{\rho c_p\,\Delta z} \approx \frac{60}{1.1\times 1005\times 50}\ \mathrm{K\,s^{-1}} \approx 4\ \mathrm{K\,h^{-1}}`,
            caption: "雲頂での冷却率の概算",
          },
        ],
        after: [
          String.raw`$F$ は正味の上向き赤外放射フラックス $[\mathrm{W\,m^{-2}}]$、$\rho \approx 1.1\,\mathrm{kg\,m^{-3}}$ は空気の密度です。雲頂をはさんだ $F$ の差 $\Delta F$ は典型的に $50$〜$80\,\mathrm{W\,m^{-2}}$ で、それが厚さ $\Delta z \approx 50\,\mathrm{m}$ 程度に集中するので、冷却率は数 $\mathrm{K\,h^{-1}}$ に達します。`,
          String.raw`冷やされて重くなった雲頂の空気は塊になって沈み、その代わりに下から空気が上がってきます。地面が温められて下から熱気泡が上がる晴天の対流とは上下が逆の、「上から冷やされて起こる対流」です。この乱流が境界層をかき混ぜ、海面からの水蒸気を雲まで運び続けるので、雲が維持されます。`,
          String.raw`昼間は雲が日射を吸収して雲頂の冷却を一部打ち消すため、乱流が弱まり、雲は午後に薄くなりがちです。夜は冷却だけが働くので、層積雲は明け方にいちばん厚く広くなる、というはっきりした日変化があります。`,
        ],
      },
      {
        heading: "雲頂高度の収支：エントレインメントと沈降",
        paragraphs: [
          String.raw`雲頂の高さ $z_i$ は、二つの効果の綱引きで決まります。ひとつは、境界層の乱流が逆転層の上の空気を少しずつ取り込んで（エントレインメント）層を厚くする効果、もうひとつは、高気圧のもとでの大規模な下降流が逆転層を押し下げる効果です。`,
        ],
        equations: [
          {
            tex: String.raw`\frac{dz_i}{dt} = w_e + \bar{w}(z_i) = w_e - D\,z_i`,
            caption: String.raw`混合層の厚さの収支（下降流を $\bar{w} = -Dz$ とおいた場合）`,
          },
          {
            tex: String.raw`z_i^{\ast} = \frac{w_e}{D} \approx \frac{4\times10^{-3}\ \mathrm{m\,s^{-1}}}{4\times10^{-6}\ \mathrm{s^{-1}}} = 1\ \mathrm{km}`,
            caption: "釣り合ったときの雲頂高度の目安",
          },
          {
            tex: String.raw`w_e \approx A\,\frac{w_\ast^{3}}{z_i\,\Delta b}, \qquad \Delta b = g\,\frac{\Delta\theta_v}{\theta_0}`,
            caption: "エントレインメント速度のよく使われる経験的なモデル",
          },
        ],
        after: [
          String.raw`$w_e$ はエントレインメント速度で、観測では数 $\mathrm{mm\,s^{-1}}$ です。$D$ は大規模な水平発散で、亜熱帯の海上では $4\times10^{-6}\,\mathrm{s^{-1}}$ 程度です。下降流 $\bar{w} = -Dz$ は高さ $1\,\mathrm{km}$ で約 $-4\,\mathrm{mm\,s^{-1}}$ になり、エントレインメントとほぼ打ち消し合います。`,
          String.raw`$w_\ast$ は境界層の対流速度スケール（典型的に $0.5$〜$1\,\mathrm{m\,s^{-1}}$）、$\Delta\theta_v$ は逆転層をはさんだ仮温位の差、$\theta_0$ は基準の温位、$g$ は重力加速度、$\Delta b$ は逆転層の「浮力の段差」、$A$ は経験的な係数で、研究によって $0.2$〜$1$ 程度の幅があります。逆転が強いほど $\Delta b$ が大きく、乾いた上空の空気が入りにくくなるので、雲は保たれやすくなります。下層の安定度（たとえば $700\,\mathrm{hPa}$ と地表の温位差）が大きい海域ほど層積雲の雲量が多いことは、観測的によく知られています。`,
          String.raw`逆に、取り込んだ暖かく乾いた空気が雲水の蒸発で冷やされ、もとの雲の空気より重くなってしまう条件では、混合が混合を呼んで雲が急に崩れることがあります（雲頂エントレインメント不安定）。また、貿易風に流されて暖かい海の上に移ると、境界層が厚くなって雲の層と海面付近の層が切り離され、層積雲は積雲へと移り変わっていきます。`,
        ],
      },
      {
        heading: "細胞状の模様とレイリー・ベナール対流",
        paragraphs: [
          String.raw`衛星から見ると、層積雲は蜂の巣のような細胞（セル）状の模様をつくっていることがよくあります。これは下から温めた（あるいは上から冷やした）流体の層に現れるレイリー・ベナール対流のセルとよく似ています。`,
          String.raw`理想化したレイリー・ベナール問題では、層の不安定さをレイリー数 $\mathrm{Ra}$ で測り、それが臨界値を超えると対流が始まります。`,
        ],
        equations: [
          {
            tex: String.raw`\mathrm{Ra} = \frac{g\,\alpha\,\Delta T\,d^{3}}{\nu\,\kappa}`,
            caption: "レイリー数（浮力による駆動と、粘性・熱拡散による抑制の比）",
          },
          {
            tex: String.raw`\mathrm{Ra}_c \approx 1708, \qquad \lambda_c \approx 2.0\,d \quad (\text{上下とも固定壁の場合})`,
            caption: "線形安定性理論による臨界レイリー数と、そのときのセルの幅",
          },
        ],
        after: [
          String.raw`$\alpha$ は熱膨張率（気体では $\approx 1/T$）、$\Delta T$ は層の上下の温度差、$d$ は層の厚さ、$\nu \approx 1.5\times10^{-5}\,\mathrm{m^2\,s^{-1}}$ は動粘性係数、$\kappa \approx 2\times10^{-5}\,\mathrm{m^2\,s^{-1}}$ は熱拡散率、$\lambda_c$ は対流が始まるときのセルの幅です。`,
          String.raw`ただし、この類似は定性的なものです。分子の $\nu, \kappa$ を使って $d = 1\,\mathrm{km}$、$\Delta T = 1\,\mathrm{K}$ とすると $\mathrm{Ra} \sim 10^{17}$ となり、臨界値をけた違いに超えた乱流状態です。実際のセルの幅は雲の層の厚さの $10$〜$30$ 倍ほどもあり、理論の $2$ 倍よりずっと横長です。この横長さは、潜熱の放出、雲頂の放射冷却、霧雨による蒸発冷却など、理想化した問題にはない効果によると考えられていて、完全には説明しきれていません。`,
          String.raw`セルには二つの型があります。「閉じたセル」は雲のかたまりが中心にあり、そのまわりを細いすき間（下降流）が囲む形で、空はほぼ雲に覆われます。「開いたセル」は逆に、晴れた中心のまわりを雲の輪が囲む形で、寒気が暖かい海に吹き出したときや、霧雨が多く降って雲粒の数が少ないところでよく見られます。`,
        ],
      },
    ],
  },
  {
    id: "stratus",
    summary: String.raw`層雲は、地面から離れて浮かんだ霧のような、灰色で一様な低い雲です。晴れた静かな夜の放射冷却や、暖かく湿った空気が冷たい海の上を流れることで空気が露点まで冷え、地面近くの層全体が一様に飽和してできます。雲粒が小さく上昇流も弱いので、降っても霧雨どまりです。`,
    identify: [
      String.raw`灰色の一様な層で、底がのっぺりしていて凹凸がほとんどありません。`,
      String.raw`とても低く（数十〜数百 m）、高い建物の上部や山の中腹を隠します。`,
      String.raw`太陽が透けて見えるときは輪郭がはっきりしていて、巻層雲のような暈（かさ）はふつうできません。`,
      String.raw`降るとしても霧雨（寒いときは霧雪）です。雨雲の下をちぎれて流れる低い雲（ちぎれ雲）も層雲の仲間です。`,
    ],
    sections: [
      {
        heading: "地面を離れた霧",
        paragraphs: [
          String.raw`霧と層雲は、中身はほぼ同じ「小さな水滴が浮かんだ飽和した空気」です。地面に接していて見通し（視程）が $1\,\mathrm{km}$ 未満なら霧、底が地面から離れていれば層雲と呼びます。朝に日が当たると地面が温まり、霧は下から蒸発して底が持ち上がり、層雲になります。山の斜面を上る湿った空気が冷えてできる層雲もあります。`,
          String.raw`層雲の底が平らでくっきりしているのは、よく混ざった下層の空気がどこでも同じ高さで飽和に達するからです。雲底の高さは、地上の気温と露点の差からおおよそ見積もれます。`,
        ],
        equations: [
          {
            tex: String.raw`z_b \approx 125\,(T - T_d)\ \mathrm{m}`,
            caption: "持ち上げ凝結高度による雲底高度の目安（近似式）",
          },
        ],
        after: [
          String.raw`$z_b$ は雲底の高さ、$T$ と $T_d$ は地上の気温と露点 $[^\circ\mathrm{C}]$ です。層雲ができるような湿った空気では $T - T_d$ が $1$〜$2\,\mathrm{K}$ しかなく、雲底は $100$〜$250\,\mathrm{m}$ 程度と低くなります。$T = T_d$ ならそのまま地面に接した霧です。`,
          String.raw`雲底のすぐ上では、ケーラー曲線の山を越えた凝結核が一斉に雲粒へと成長するので、雲粒の数がわずか数 m の間に急に増えます。これが雲底を「くっきり」見せる理由です。`,
        ],
      },
      {
        heading: "晴れた静かな夜の放射冷却",
        paragraphs: [
          String.raw`地面は赤外線を出して冷え、大気からの赤外線を受けて温まります。晴れた夜は大気からの戻りが小さいので、正味で熱を失い続けます。雲があると雲底がほぼ黒体として赤外線を返すので、正味の損失はほとんどなくなります。曇った夜が冷え込まないのはこのためです。`,
        ],
        equations: [
          {
            tex: String.raw`F_{\text{net}} = \varepsilon_s\,\sigma T_s^{4} - \varepsilon_a\,\sigma T_a^{4}`,
            caption: "地面の正味の赤外放射による熱損失",
          },
          {
            tex: String.raw`\frac{\partial T}{\partial t} \approx -\frac{F_{\text{net}}}{\rho c_p\,h} \approx -\frac{50}{1.2\times1005\times50}\ \mathrm{K\,s^{-1}} \approx -3\ \mathrm{K\,h^{-1}}`,
            caption: String.raw`損失が厚さ $h$ の接地層に配られたときの冷却率の概算（地中からの熱を無視）`,
          },
        ],
        after: [
          String.raw`$\sigma = 5.67\times10^{-8}\,\mathrm{W\,m^{-2}\,K^{-4}}$ はステファン・ボルツマン定数、$T_s$ と $T_a$ は地面と大気の（実効的な）温度、$\varepsilon_s \approx 1$ は地面の射出率、$\varepsilon_a$ は大気の実効射出率です。晴天では $\varepsilon_a \approx 0.7$〜$0.8$ で、$T \approx 280\,\mathrm{K}$ なら $\sigma T^4 \approx 350\,\mathrm{W\,m^{-2}}$ なので、$F_{\text{net}}$ は $50$〜$100\,\mathrm{W\,m^{-2}}$ になります。低い雲に覆われると $\varepsilon_a \to 1$ で $F_{\text{net}} \approx 0$ です。`,
          String.raw`$h$ は冷やされる接地層の厚さ、$\rho \approx 1.2\,\mathrm{kg\,m^{-3}}$ は空気の密度です。実際には地中からの熱の補給があるので冷却はこれより遅くなりますが、一晩で数 K から $10\,\mathrm{K}$ 近く冷えて露点に届くのは自然な大きさです。風が強いと冷却が厚い層に薄まって露点まで下がらず、まったくの無風だと冷えた空気が地面すれすれに留まって露になるだけです。弱い風（$1$〜$3\,\mathrm{m\,s^{-1}}$）が冷えた空気をほどよく混ぜるときに、厚い放射霧ができやすくなります。盆地や川沿いでよく霧が出るのは、冷えて重くなった空気が低いところに集まるからです。`,
        ],
      },
      {
        heading: "冷たい海の上の移流霧",
        paragraphs: [
          String.raw`暖かく湿った空気が冷たい海面の上を流れると、下から冷やされて露点に達し、霧や層雲ができます（移流霧、海霧）。夏の北海道東部や三陸沖のように、寒流の上に南からの湿った風が吹き込む海域が典型で、海から陸へ流れ込んだ海霧は持ち上がって層雲になります。`,
          String.raw`海面への顕熱フラックスをバルク式で書き、それが厚さ $h$ の層を冷やすと考えると、空気の温度は海面水温に向かって指数関数的に近づきます。`,
        ],
        equations: [
          {
            tex: String.raw`H = \rho c_p\,C_H\,U\,(T_a - T_{\text{sea}})`,
            caption: "空気から海面へ向かう顕熱フラックス（バルク式）",
          },
          {
            tex: String.raw`\frac{dT_a}{dt} = -\frac{C_H U}{h}\,(T_a - T_{\text{sea}}) \;\Rightarrow\; T_a - T_{\text{sea}} \propto e^{-t/\tau},\quad \tau = \frac{h}{C_H U}`,
            caption: "空気とともに動きながら見た温度の変化",
          },
          {
            tex: String.raw`L = U\tau = \frac{h}{C_H} \approx \frac{200\ \mathrm{m}}{1\times10^{-3}} = 200\ \mathrm{km}`,
            caption: "冷却が進む距離の目安（風速によらない）",
          },
        ],
        after: [
          String.raw`$C_H \approx 1\times10^{-3}$ は熱のバルク輸送係数、$U$ は風速、$T_a$ は気温、$T_{\text{sea}}$ は海面水温、$h$ は冷やされる層の厚さ、$\tau$ は冷却の時定数です。たとえば $U = 5\,\mathrm{m\,s^{-1}}$、$h = 200\,\mathrm{m}$ なら $\tau \approx 4\times10^{4}\,\mathrm{s}$（約11時間）で、空気は約 $200\,\mathrm{km}$ 進むあいだに海面水温との差を $1/e$ に縮めます。`,
          String.raw`気温と露点の差が数 K なら、寒流の上を数百 km 流れるうちに飽和に達するという見積もりになり、海霧が広い範囲にわたって何日も続くことと合っています。逆に、冷たい空気が暖かい海に流れ出す場合は下から温められて対流が起き、層雲ではなく積雲や層積雲の開いたセルになります。`,
        ],
      },
      {
        heading: "霧の中の見通しを見積もる",
        paragraphs: [
          String.raw`霧や層雲の中でどれくらい先まで見えるかは、光が雲粒によってどれだけ散乱されるかで決まります。黒い目標物と背景の明るさのコントラストが距離とともに指数関数的に薄れ、人の目で見分けられる限界（$2\%$）まで下がる距離を視程とするのが、コシュミーダーの法則です。`,
        ],
        equations: [
          {
            tex: String.raw`V = \frac{-\ln 0.02}{\beta} = \frac{3.912}{\beta}`,
            caption: "コシュミーダーの法則（視程と消散係数の関係）",
          },
          {
            tex: String.raw`\beta = N\,Q_{\text{ext}}\,\pi r^{2} \approx 2\pi N r^{2} = \frac{3W}{2\rho_w\,r}`,
            caption: String.raw`雲粒による消散係数（大きさのそろった粒、$Q_{\text{ext}} \approx 2$ とした近似）`,
          },
          {
            tex: String.raw`N = 100\ \mathrm{cm^{-3}},\ r = 5\ \mu\mathrm{m} \;\Rightarrow\; \beta \approx 1.6\times10^{-2}\ \mathrm{m^{-1}},\quad V \approx 250\ \mathrm{m}`,
            caption: "典型的な霧での見積もり",
          },
        ],
        after: [
          String.raw`$V$ は視程、$\beta$ は消散係数 $[\mathrm{m^{-1}}]$、$N$ は雲粒の数密度、$r$ は雲粒の半径、$Q_{\text{ext}}$ は消散効率です。雲粒（半径 $\sim 10\,\mu\mathrm{m}$）は可視光の波長 $0.5\,\mu\mathrm{m}$ よりずっと大きいので、幾何光学の極限で $Q_{\text{ext}} \approx 2$ になります（幾何学的な断面積の2倍の光を取り除く、いわゆる消散のパラドックス）。`,
          String.raw`最後の形の $W = \tfrac{4}{3}\pi r^3 \rho_w N$ は単位体積あたりの液水量、$\rho_w = 1000\,\mathrm{kg\,m^{-3}}$ は水の密度です。上の例では $W \approx 0.05\,\mathrm{g\,m^{-3}}$ で、霧としてごく典型的な値です。$\beta \propto W/r$ なので、同じ水の量でも粒が小さく数が多いほど見通しが悪くなります。凝結核の多い汚れた空気の霧が濃く見えやすいのはこのためです。`,
        ],
      },
      {
        heading: "霧雨しか降らない理由",
        paragraphs: [
          String.raw`層雲の雲粒は半径 $5$〜$10\,\mu\mathrm{m}$ ほどで、ストークスの落下速度は $1\,\mathrm{cm\,s^{-1}}$ 前後しかありません。わずかな乱流でも浮かんでいられるので、そのままでは落ちてきません。`,
          String.raw`降水になるには、たまたま大きくなった粒が落ちながら小さな雲粒を併合して育つ必要があります。大きな粒が液水量 $W$ の雲の中を落ちるとき、半径の成長は次の「連続併合モデル」で近似できます。`,
        ],
        equations: [
          {
            tex: String.raw`v = \frac{2\rho_w g\,r^{2}}{9\mu} \approx 1.2\ \mathrm{cm\,s^{-1}} \quad (r = 10\ \mu\mathrm{m})`,
            caption: "雲粒のストークス落下速度",
          },
          {
            tex: String.raw`\frac{dR}{dt} = \frac{E\,W\,v(R)}{4\rho_w} \;\Rightarrow\; \frac{dR}{dz_{\downarrow}} = \frac{E\,W}{4\rho_w} \;\Rightarrow\; \Delta R \approx \frac{E\,W\,H}{4\rho_w}`,
            caption: String.raw`上昇流がないとき、落下距離 $H$ のあいだに増える半径（連続併合モデル）`,
          },
          {
            tex: String.raw`\Delta R \approx \frac{0.8 \times 2\times10^{-4}\ \mathrm{kg\,m^{-3}} \times 500\ \mathrm{m}}{4 \times 1000\ \mathrm{kg\,m^{-3}}} = 2\times10^{-5}\ \mathrm{m} = 20\ \mu\mathrm{m}`,
            caption: "厚さ500 m の層雲を落ちきるあいだの成長",
          },
        ],
        after: [
          String.raw`$\mu \approx 1.8\times10^{-5}\,\mathrm{Pa\,s}$ は空気の粘性係数、$R$ は落ちていく大きな粒の半径、$v(R)$ はその落下速度、$E$ は衝突併合効率（$0.5$〜$1$）、$W$ は雲の液水量、$z_{\downarrow}$ は下向きに測った距離です。$dz_{\downarrow} = v\,dt$ を使うと $v(R)$ が消え、増える半径は落ちた距離だけで決まります。`,
          String.raw`液水量 $0.2\,\mathrm{g\,m^{-3}}$、厚さ $500\,\mathrm{m}$ の層雲を落ちきっても、半径は $20\,\mu\mathrm{m}$ ほどしか増えません。雨粒（半径 $1\,\mathrm{mm}$ 程度）にはほど遠く、できるのは直径 $0.5\,\mathrm{mm}$ 未満の霧雨粒どまりです。厚くて液水量が多く、強い上昇流で粒を何度も持ち上げられる積乱雲や乱層雲とは、ここが決定的に違います。`,
          String.raw`層雲は低く薄いので、氷晶ができやすい $-10^\circ\mathrm{C}$ 以下まで雲頂が冷えることは多くありません。そのため氷晶が水滴を食べて育つウェゲナー・ベルジェロン・フィンダイゼンの過程も働きにくく、寒いときでも降るのは霧雪（直径 $1\,\mathrm{mm}$ 未満の白く不透明な氷の粒）程度です。`,
        ],
      },
    ],
  },
];
