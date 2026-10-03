/* Persistent owners, racing calendar, breeding and ranch accounts. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./model.js'));
  else root.RanchWorld=factory(root.RanchModel);
})(globalThis,function(M){
  'use strict';
  const YEAR=48, CAPACITY=18, GESTATION=4, PLAN_WEEKS=4, RESERVE_WEEKS=12;
  // Chocobo Stallion's six courses: laps, surface and weather follow the original; straights and hills are our tuning.
  // Key order sets the monthly rotation of conditional races (turf and dirt alternate).
  const TRACKS={
    tenku:{id:'tenku',name:'天空神殿',surface:'turf',theme:'芝・左回り。天候の変化がない大舞台',lap:2100,straight:525,hill:.2,wind:0,heat:0,color:'#aaba87'},
    oukyu:{id:'oukyu',name:'王宮都市',surface:'dirt',theme:'ダート・右回り。城下を巡る坂のあるコース',lap:1850,straight:330,hill:.4,wind:.1,heat:.2,color:'#c5ae8d'},
    mitsurin:{id:'mitsurin',name:'熱帯密林',surface:'turf',theme:'芝・右回り。雨の多い蒸し暑い小回り',lap:1600,straight:300,hill:.3,wind:.1,heat:.7,color:'#95ad82'},
    sunahama:{id:'sunahama',name:'砂浜公園',surface:'dirt',theme:'ダート・左回り。海風が吹く平坦なコース',lap:1632,straight:350,hill:0,wind:.6,heat:.4,color:'#d6c39b'},
    iseki:{id:'iseki',name:'秘境遺跡',surface:'turf',theme:'芝・左回り。冬は雪も降る起伏の多いコース',lap:1800,straight:400,hill:.6,wind:.4,heat:0,color:'#a9bcb0'},
    haikou:{id:'haikou',name:'山岳廃坑',surface:'dirt',theme:'ダート・右回り。急坂と山風の厳しいコース',lap:1804,straight:350,hill:.7,wind:.3,heat:0,color:'#b59f86'},
  };
  // Earlier saves used these track ids.
  const OLD_TRACKS={cornelia:'tenku',midgar:'oukyu',ishgard:'iseki',ronka:'mitsurin'};
  const CLASSES={
    new:{name:'新羽',prize:1000,gain:400,fee:40,allowance:120},
    maiden:{name:'未勝利',prize:900,gain:400,fee:40,allowance:120},
    c1:{name:'1勝クラス',prize:1600,gain:400,fee:60,allowance:150},
    c2:{name:'2勝クラス',prize:2400,gain:600,fee:80,allowance:180},
    c3:{name:'3勝クラス',prize:3600,gain:900,fee:100,allowance:220},
    open:{name:'オープン',prize:5500,gain:1200,fee:150,allowance:260},
    GIII:{name:'GⅢ',prize:12000,gain:1600,fee:250,allowance:300},
    GII:{name:'GⅡ',prize:20000,gain:2400,fee:400,allowance:400},
    GI:{name:'GⅠ',prize:40000,gain:4000,fee:700,allowance:500},
  };
  // GⅠ follow the current JRA calendar. Names are Chocobo Stallion's counterparts; GⅠ added since then use new FF names.
  // A week may hold several stakes (Dec wk4: Arima and Hopeful).
  const LEGACY_STAKES=[
    [4,'ダイヤモンドダスト杯','GIII','iseki',1800,'turf',4,9],
    [8,'タイタンステークス','GI','oukyu',1600,'dirt',4,9],          // フェブラリーS
    [12,'カーバンクル記念','GI','iseki',1200,'turf',4,9],            // 高松宮記念
    [13,'リヴァイアサン記念','GI','mitsurin',2000,'turf',4,9],          // 大阪杯（新設GⅠ）
    [14,'クリスタル賞','GI','mitsurin',1600,'turf',3,3,'F'],           // 桜花賞
    [15,'神竜賞','GI','tenku',2000,'turf',3,3],                      // 皐月賞
    [17,'オーディーン賞（春）','GI','mitsurin',3200,'turf',4,9],       // 天皇賞（春）
    [18,'CRAマイルカップ','GI','tenku',1600,'turf',3,3],          // NHKマイルC
    [19,'セイレーンカップ','GI','tenku',1600,'turf',4,9,'F'],      // ヴィクトリアマイル（新設GⅠ）
    [20,'チョコボオークス','GI','tenku',2400,'turf',3,3,'F'],
    [21,'チョコボダービー','GI','tenku',2400,'turf',3,3],
    [22,'イフリート記念','GI','tenku',1600,'turf',3,9],            // 安田記念
    [23,'フェニックス記念','GI','mitsurin',2200,'turf',3,9],             // 宝塚記念
    [28,'コスタ・デル・ソル杯','GIII','sunahama',1200,'dirt',3,9],
    [32,'王宮大賞典','GII','oukyu',2000,'dirt',4,9],
    [37,'ラムウステークス','GI','tenku',1200,'turf',3,9],             // スプリンターズS
    [39,'ミスリル賞','GI','mitsurin',2000,'turf',3,3,'F'],             // 秋華賞
    [40,'オメガ賞','GI','iseki',3000,'turf',3,3],                   // 菊花賞
    [41,'オーディーン賞（秋）','GI','tenku',2000,'turf',3,9],       // 天皇賞（秋）
    [42,'シヴァ女王杯','GI','iseki',2200,'turf',3,9,'F'],           // エリザベス女王杯
    [43,'アレクサンダーカップ','GI','tenku',1600,'turf',3,9],        // マイルCS
    [44,'CRAワールドカップ','GI','tenku',2400,'turf',3,9],          // ジャパンカップ
    [45,'ナイツ・オブ・ラウンド記念','GI','sunahama',1800,'dirt',3,9],    // チャンピオンズC（新設GⅠ）
    [46,'オニオンガールステークス','GI','mitsurin',1600,'turf',2,2,'F'],   // 阪神JF
    [47,'オニオンボーイステークス','GI','tenku',1600,'turf',2,2],      // 朝日杯FS
    [48,'バハムート記念','GI','tenku',2500,'turf',3,9],               // 有馬記念
    [48,'光の戦士ステークス','GI','tenku',2000,'turf',2,2],            // ホープフルS（新設GⅠ）
  ];
  // 2026 JRA flat GII/GIII (38/68) and regional dirt grades (46), adapted to 48 weeks.
  // Sources and the complete correspondence are documented in docs/RACING_CALENDAR.md.
  const CENTRAL_STAKES=[
    [3,'新春天空賞','GII','tenku',2400,'turf',4,9,null,'日経新春杯'],
    [4,'モーグリクラブ杯','GII','mitsurin',2200,'turf',4,9,null,'アメリカJCC'],
    [4,'ベヒーモスステークス','GII','haikou',1800,'dirt',4,9,null,'プロキオンS'],
    [7,'白銀神殿記念','GII','iseki',2200,'turf',4,9,null,'京都記念'],
    [9,'密林王冠','GII','mitsurin',1800,'turf',4,9,null,'中山記念'],
    [9,'クリスタルチューリップ賞','GII','mitsurin',1600,'turf',3,3,'F','チューリップ賞'],
    [10,'乙女カーバンクル杯','GII','iseki',1400,'turf',3,3,'F','フィリーズレビュー'],
    [10,'若葉神竜賞','GII','tenku',2000,'turf',3,3,null,'弥生賞'],
    [11,'春風チョコボ賞','GII','mitsurin',1800,'turf',3,3,null,'スプリングS'],
    [11,'金色リヴァイアサン賞','GII','iseki',2000,'turf',4,9,null,'金鯱賞'],
    [11,'天空大賞典','GII','tenku',3000,'turf',4,9,null,'阪神大賞典'],
    [12,'オーディーン前哨戦','GII','mitsurin',2500,'turf',4,9,null,'日経賞'],
    [14,'若羽マイルトロフィー','GII','tenku',1600,'turf',3,3,null,'ニュージーランドT'],
    [14,'春のセイレーン賞','GII','mitsurin',1600,'turf',4,9,'F','阪神牝馬S'],
    [16,'青葉チョコボ杯','GII','tenku',2400,'turf',3,3,null,'青葉賞'],
    [16,'フローラセイレーン杯','GII','tenku',2000,'turf',3,3,'F','フローラS'],
    [16,'天空マイラーズ杯','GII','iseki',1600,'turf',4,9,null,'マイラーズC'],
    [17,'イフリート前哨戦','GII','tenku',1400,'turf',4,9,null,'京王杯スプリングC'],
    [18,'若羽天空新聞杯','GII','iseki',2200,'turf',3,3,null,'京都新聞杯'],
    [20,'天空目黒記念','GII','tenku',2500,'turf',4,9,null,'目黒記念'],
    [31,'北国クリスタル記念','GII','iseki',2000,'turf',3,9,null,'札幌記念'],
    [33,'紫苑ミスリル賞','GII','mitsurin',2000,'turf',3,3,'F','紫苑S'],
    [33,'疾風ラムウ杯','GII','mitsurin',1200,'turf',3,9,null,'セントウルS'],
    [34,'秋風神竜記念','GII','tenku',2200,'turf',3,3,null,'セントライト記念'],
    [34,'ローズミスリル杯','GII','mitsurin',1800,'turf',3,3,'F','ローズS'],
    [35,'秋のフェニックス杯','GII','mitsurin',2200,'turf',3,9,null,'オールカマー'],
    [35,'秋空チョコボ杯','GII','mitsurin',2400,'turf',3,3,null,'神戸新聞杯'],
    [37,'天空毎日王冠','GII','tenku',1800,'turf',3,9,null,'毎日王冠'],
    [37,'遺跡クリスタル大賞典','GII','iseki',2400,'turf',3,9,null,'京都大賞典'],
    [38,'秋のセイレーン賞','GII','tenku',1800,'turf',3,9,'F','アイルランドT'],
    [38,'シルフスワン杯','GII','iseki',1400,'turf',3,9,null,'スワンS'],
    [39,'アレクサンダー前哨戦','GII','tenku',1600,'turf',3,9,null,'富士S'],
    [41,'若羽王冠スプリント','GII','tenku',1400,'turf',2,2,null,'京王杯2歳S'],
    [42,'天空共和国杯','GII','tenku',2500,'turf',3,9,null,'アルゼンチン共和国杯'],
    [42,'若羽デイリーマイル','GII','iseki',1600,'turf',2,2,null,'デイリー杯2歳S'],
    [43,'若羽天空スポーツ杯','GII','tenku',1800,'turf',2,2,null,'東京スポーツ杯2歳S'],
    [45,'天空ステイヤーズ賞','GII','tenku',3600,'turf',3,9,null,'ステイヤーズS'],
    [48,'密林スプリントカップ','GII','mitsurin',1400,'turf',3,9,null,'阪神C'],
    [1,'新春モーグリ金杯','GIII','tenku',2000,'turf',4,9,null,'中山金杯'],
    [1,'新春クリスタル金杯','GIII','iseki',1600,'turf',4,9,null,'京都金杯'],
    [2,'フェアリークリスタル賞','GIII','mitsurin',1600,'turf',3,3,'F','フェアリーS'],
    [2,'若駒ミスリル記念','GIII','iseki',1600,'turf',3,3,null,'シンザン記念'],
    [3,'若駒神殿杯','GIII','tenku',2000,'turf',3,3,null,'京成杯'],
    [4,'冬のシヴァステークス','GIII','iseki',2000,'turf',4,9,'F','小倉牝馬S'],
    [5,'王宮根岸ステークス','GIII','oukyu',1400,'dirt',4,9,null,'根岸S'],
    [5,'シルクロードカーバンクル杯','GIII','iseki',1200,'turf',4,9,null,'シルクロードS'],
    [6,'若羽きさらぎ賞','GIII','mitsurin',1800,'turf',3,3,null,'きさらぎ賞'],
    [6,'天空新聞マイル杯','GIII','tenku',1600,'turf',4,9,null,'東京新聞杯'],
    [7,'クイーンクリスタル杯','GIII','tenku',1600,'turf',3,3,'F','クイーンC'],
    [7,'若羽通信杯','GIII','tenku',1800,'turf',3,3,null,'共同通信杯'],
    [8,'遺跡ダイヤモンドステークス','GIII','iseki',3400,'turf',4,9,null,'ダイヤモンドS'],
    [8,'シルフ急行杯','GIII','mitsurin',1400,'turf',4,9,null,'阪急杯'],
    [8,'密林大賞典','GIII','mitsurin',1800,'turf',4,9,null,'小倉大賞典'],
    [8,'オーシャンカーバンクル杯','GIII','tenku',1200,'turf',4,9,null,'オーシャンS'],
    [9,'春風シヴァステークス','GIII','tenku',1800,'turf',4,9,'F','中山牝馬S'],
    [11,'フラワーセイレーン杯','GIII','mitsurin',1800,'turf',3,3,'F','フラワーC'],
    [11,'ファルコンスプリント','GIII','iseki',1400,'turf',3,3,null,'ファルコンS'],
    [11,'シルフ女王杯','GIII','iseki',1400,'turf',4,9,'F','愛知杯'],
    [12,'若羽毎日杯','GIII','mitsurin',1800,'turf',3,3,null,'毎日杯'],
    [12,'山岳マーチステークス','GIII','haikou',1800,'dirt',4,9,null,'マーチS'],
    [13,'天空ダービー卿杯','GIII','tenku',1600,'turf',4,9,null,'ダービー卿チャレンジT'],
    [13,'若羽クリスタルトロフィー','GIII','mitsurin',1600,'turf',3,3,null,'チャーチルダウンズC'],
    [15,'アンタレスベヒーモス杯','GIII','oukyu',1800,'dirt',4,9,null,'アンタレスS'],
    [15,'春の密林牝羽杯','GIII','mitsurin',1800,'turf',4,9,'F','福島牝馬S'],
    [17,'ユニコーンチョコボ杯','GIII','haikou',1900,'dirt',3,3,null,'ユニコーンS'],
    [18,'天空エプソム杯','GIII','tenku',1800,'turf',4,9,null,'エプソムC'],
    [19,'遺跡大賞典','GIII','iseki',2000,'turf',4,9,null,'新潟大賞典'],
    [20,'王宮平安ステークス','GIII','oukyu',1900,'dirt',4,9,null,'平安S'],
    [20,'葵カーバンクル賞','GIII','iseki',1200,'turf',3,3,null,'葵S'],
    [22,'北風スプリント','GIII','iseki',1200,'turf',3,9,null,'函館スプリントS'],
    [23,'天空牝羽ステークス','GIII','tenku',1800,'turf',3,9,'F','府中牝馬S'],
    [23,'白羽マイルステークス','GIII','mitsurin',1600,'turf',3,9,null,'しらさぎS'],
    [24,'若羽ラジオ杯','GIII','mitsurin',1800,'turf',3,3,null,'ラジオNIKKEI賞'],
    [24,'北国モーグリ記念','GIII','iseki',2000,'turf',3,9,null,'函館記念'],
    [25,'密林ラムウ記念','GIII','mitsurin',1200,'turf',3,9,null,'北九州記念'],
    [26,'星降るモーグリ賞','GIII','tenku',2000,'turf',3,9,null,'七夕賞'],
    [27,'密林サマー記念','GIII','mitsurin',2000,'turf',3,9,null,'小倉記念'],
    [27,'北国若羽スプリント','GIII','iseki',1200,'turf',2,2,null,'函館2歳S'],
    [28,'遺跡サマーマイル','GIII','iseki',1600,'turf',3,9,null,'関屋記念'],
    [28,'砂浜東海ステークス','GIII','sunahama',1400,'dirt',3,9,null,'東海S'],
    [29,'サボテンダーダッシュ','GIII','iseki',1000,'turf',3,9,null,'アイビスサマーダッシュ'],
    [29,'夏のシヴァ女王賞','GIII','iseki',1800,'turf',3,9,'F','クイーンS'],
    [30,'山岳エルムステークス','GIII','haikou',1700,'dirt',3,9,null,'エルムS'],
    [30,'レパードチョコボ杯','GIII','sunahama',1800,'dirt',3,3,null,'レパードS'],
    [30,'CRAサマースプリント','GIII','tenku',1200,'turf',3,9,null,'CBC賞'],
    [31,'天空サマー記念','GIII','tenku',1600,'turf',3,9,null,'中京記念'],
    [32,'遺跡若羽マイル','GIII','iseki',1600,'turf',2,2,null,'新潟2歳S'],
    [32,'北国キーンランド杯','GIII','iseki',1200,'turf',3,9,null,'キーンランドC'],
    [32,'遺跡モーグリ記念','GIII','iseki',2000,'turf',3,9,null,'新潟記念'],
    [32,'天空若羽スプリント','GIII','tenku',1400,'turf',2,2,null,'中京2歳S'],
    [33,'秋のクリスタルマイル','GIII','tenku',1600,'turf',3,9,null,'京成杯オータムH'],
    [33,'北国若羽ステークス','GIII','iseki',1800,'turf',2,2,null,'札幌2歳S'],
    [34,'フェニックスチャレンジ杯','GIII','mitsurin',2000,'turf',3,9,null,'チャレンジC'],
    [36,'山岳シリウスステークス','GIII','haikou',2000,'dirt',3,9,null,'シリウスS'],
    [38,'若羽ロイヤルマイル','GIII','tenku',1600,'turf',2,2,null,'サウジアラビアロイヤルC'],
    [40,'アルテミスセイレーン賞','GIII','tenku',1600,'turf',2,2,'F','アルテミスS'],
    [40,'オニオンファンタジー賞','GIII','iseki',1400,'turf',2,2,'F','ファンタジーS'],
    [41,'王宮みやこステークス','GIII','oukyu',1800,'dirt',3,9,null,'みやこS'],
    [42,'砂浜武蔵野ステークス','GIII','sunahama',1600,'dirt',3,9,null,'武蔵野S'],
    [43,'紅葉モーグリ記念','GIII','mitsurin',2000,'turf',3,9,null,'福島記念'],
    [44,'若羽光の芽ステークス','GIII','iseki',2000,'turf',2,2,null,'京都2歳S'],
    [44,'夕風ラムウ杯','GIII','iseki',1200,'turf',3,9,null,'京阪杯'],
    [45,'密林鳴尾記念','GIII','mitsurin',1800,'turf',3,9,null,'鳴尾記念'],
    [46,'天空冬の新聞杯','GIII','tenku',2000,'turf',3,9,null,'中日新聞杯'],
    [46,'王宮カペラスプリント','GIII','oukyu',1200,'dirt',3,9,null,'カペラS'],
    [47,'ターコイズシヴァ杯','GIII','tenku',1600,'turf',3,9,'F','ターコイズS'],
  ];
  const REGIONAL_STAKES=[
    [3,'ブルーバードチョコボ杯','GIII','sunahama',1800,'dirt',3,3,null,'ブルーバードカップ'],
    [6,'王宮クイーン賞','GIII','oukyu',1800,'dirt',4,9,'F','クイーン賞'],
    [6,'山岳タイタン記念','GIII','haikou',2000,'dirt',4,9,null,'佐賀記念'],
    [7,'雲取チョコボ賞','GIII','oukyu',1800,'dirt',3,3,null,'雲取賞'],
    [8,'かきつばたシルフ記念','GIII','haikou',1500,'dirt',4,9,null,'かきつばた記念'],
    [10,'ダイオライト王宮記念','GII','oukyu',2400,'dirt',4,9,null,'ダイオライト記念'],
    [12,'黒船リヴァイアサン賞','GIII','sunahama',1400,'dirt',4,9,null,'黒船賞'],
    [12,'京浜チョコボ盃','GII','sunahama',1700,'dirt',3,3,null,'京浜盃'],
    [13,'山岳女王盃','GIII','haikou',1870,'dirt',4,9,'F','兵庫女王盃'],
    [14,'王宮リヴァイアサン記念','GI','oukyu',2100,'dirt',4,9,null,'川崎記念'],
    [15,'王宮スプリント','GIII','oukyu',1200,'dirt',4,9,null,'東京スプリント'],
    [16,'王宮若羽盃','GI','oukyu',1800,'dirt',3,3,null,'羽田盃'],
    [17,'山岳グランプリ','GII','haikou',2100,'dirt',4,9,null,'名古屋グランプリ'],
    [17,'砂浜マイル記念','GI','sunahama',1600,'dirt',4,9,null,'かしわ記念'],
    [17,'山岳チョコボチャンピオン杯','GII','haikou',1400,'dirt',3,3,null,'兵庫チャンピオンシップ'],
    [18,'王宮エンプレス杯','GII','oukyu',2100,'dirt',4,9,'F','エンプレス杯'],
    [22,'王宮チョコボダービー','GI','oukyu',2000,'dirt',3,3,null,'東京ダービー'],
    [23,'王宮チョコボオークス','GII','oukyu',2100,'dirt',3,3,'F','関東オークス'],
    [24,'砂浜タイタン杯','GI','sunahama',1400,'dirt',3,9,null,'さきたま杯'],
    [25,'王宮帝王賞','GI','oukyu',2000,'dirt',4,9,null,'帝王賞'],
    [26,'砂浜スパーキングレディー杯','GIII','sunahama',1600,'dirt',3,9,'F','スパーキングレディーカップ'],
    [27,'山岳マーキュリー杯','GIII','haikou',2000,'dirt',3,9,null,'マーキュリーカップ'],
    [30,'砂浜クラスタースプリント','GIII','sunahama',1200,'dirt',3,9,null,'クラスターカップ'],
    [30,'北国若羽ダートスプリント','GIII','haikou',1200,'dirt',3,3,null,'北海道スプリントカップ'],
    [32,'山岳ブリーダーズ女王杯','GIII','haikou',2000,'dirt',3,9,'F','ブリーダーズゴールドカップ'],
    [33,'山岳チョコボ不来方賞','GII','haikou',2000,'dirt',3,3,null,'不来方賞'],
    [33,'砂浜サマーチャンピオン','GIII','sunahama',1400,'dirt',3,9,null,'サマーチャンピオン'],
    [35,'山岳白銀大賞典','GIII','haikou',2100,'dirt',3,9,null,'白山大賞典'],
    [35,'砂浜オーバルスプリント','GIII','sunahama',1400,'dirt',3,9,null,'オーバルスプリント'],
    [36,'王宮放送盃','GII','oukyu',1800,'dirt',3,9,null,'日本テレビ盃'],
    [37,'砂浜マリーンチョコボ杯','GIII','sunahama',1800,'dirt',3,3,'F','マリーンカップ'],
    [38,'王宮レディスプレリュード','GII','oukyu',1800,'dirt',3,9,'F','レディスプレリュード'],
    [38,'王宮ダートクラシック','GI','oukyu',2000,'dirt',3,3,null,'ジャパンダートクラシック'],
    [38,'王宮タイタンスプリント盃','GII','oukyu',1200,'dirt',3,9,null,'東京盃'],
    [38,'山岳ダートマイル王冠','GI','haikou',1600,'dirt',3,9,null,'マイルチャンピオンシップ南部杯'],
    [40,'若羽エーデルワイス賞','GIII','haikou',1200,'dirt',2,2,'F','エーデルワイス賞'],
    [41,'CRAダート若羽優駿','GIII','haikou',1800,'dirt',2,2,null,'JBC2歳優駿'],
    [41,'CRAダートレディスクラシック','GI','haikou',1500,'dirt',3,9,'F','JBCレディスクラシック'],
    [41,'CRAダートスプリント','GI','haikou',1400,'dirt',3,9,null,'JBCスプリント'],
    [41,'CRAダートクラシック','GI','haikou',2100,'dirt',3,9,null,'JBCクラシック'],
    [44,'砂浜リヴァイアサン記念','GII','sunahama',2000,'dirt',3,9,null,'浦和記念'],
    [44,'山岳ジュニアグランプリ','GII','haikou',1400,'dirt',2,2,null,'兵庫ジュニアグランプリ'],
    [47,'王宮全日本若羽優駿','GI','oukyu',1600,'dirt',2,2,null,'全日本2歳優駿'],
    [48,'山岳クリスタル大賞典','GIII','haikou',2000,'dirt',3,9,null,'名古屋大賞典'],
    [48,'山岳ゴールドトロフィー','GIII','haikou',1400,'dirt',3,9,null,'兵庫ゴールドトロフィー'],
    [48,'王宮年末大賞典','GI','oukyu',2000,'dirt',3,9,null,'東京大賞典'],
  ];
  const STAKES=[...LEGACY_STAKES,...CENTRAL_STAKES,...REGIONAL_STAKES];
  const TRAINERS=[
    {id:'apprentice',name:'リナ調教師',weekly:35,hire:150,description:'総合調教と休養を基本に、条件の合う競走へ出走。'},
    {id:'strategist',name:'セドリック調教師',weekly:70,hire:300,description:'適性に合う距離・羽場を優先。能力の不足を重点的に育成。'},
    {id:'veteran',name:'マーヤ調教師',weekly:110,hire:500,description:'余裕を持った出走間隔で重賞を狙う。好成績の4〜6歳は繁殖入り。'},
  ];
  const PROFILES=[
    ['aurora','暁レーシング','暁牧場','アカツキ'],['moon','月影オーナーズ','月影ファーム','ツキカゲ'],
    ['forest','翠風クラブ','翠風牧場','スイフウ'],['silver','白銀商会','白銀スタッド','ギンレイ'],
    ['sun','陽光レーシング','陽光牧場','ヨウコウ'],['ocean','潮騒オーナーズ','潮騒ファーム','シオサイ'],
  ];
  const SUFFIXES=['ホープ','ブレイズ','ウィング','スター','リーフ','ムーン','ゲイル','ソング','ライト','クラウン','リバー','フレア','リズム','スノウ','ロード','ベル','ノヴァ','ブルーム','シルク','ドーン'];
  const age=b=>Math.floor(b.age/YEAR);
  const monthOf=week=>Math.floor((week-1)/4);
  const date=week=>({year:Math.floor((week-1)/YEAR)+1,week:(week-1)%YEAR+1,month:Math.floor(((week-1)%YEAR)/4)+1,monthWeek:(week-1)%4+1});
  const owned=(s,id='player')=>s.birds.filter(b=>b.ownerId===id&&b.status!=='wild');
  const find=(s,id)=>s.birds.find(b=>b.id===id);
  const owner=(s,id)=>s.owners.find(o=>o.id===id);
  const cash=(s,id)=>id==='player'?s.money:owner(s,id)?.money||0;
  const trainer=s=>TRAINERS.find(t=>t.id===s.trainerId);
  function rng(seed){let n=2166136261;for(const c of String(seed))n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
  function log(s,message){s.news.push({week:s.week,message});s.news=s.news.slice(-160);}
  function account(s,ownerId,amount,category,note){
    if(ownerId==='player'){
      s.money+=amount;
      if(s.money<0){s.debt-=s.money;s.money=0;}
      s.ledger.push({week:s.week,amount,category,note,balance:s.money});s.ledger=s.ledger.slice(-400);
      // Monthly totals outlive the capped ledger so month summaries stay exact.
      const month=monthOf(s.week);let book=s.monthly.find(m=>m.month===month);
      if(!book){book={month,items:{}};s.monthly.push(book);s.monthly=s.monthly.slice(-36);}
      book.items[category]=(book.items[category]||0)+amount;
    }else{const o=owner(s,ownerId);if(o)o.money+=amount;}
  }
  function currentClass(b){if(b.races===0)return'new';if(b.wins===0)return'maiden';return b.rating<=500?'c1':b.rating<=1000?'c2':b.rating<=1600?'c3':'open';}
  const className=b=>CLASSES[currentClass(b)].name;
  const roleName=b=>b.status==='wild'?'野生':b.status==='young'?'幼羽':b.status==='breeding'?(b.sex==='M'?'種牡羽':'繁殖牝羽'):'競走羽';
  const fertile=b=>b.status==='breeding'&&age(b)>=3&&age(b)<=30&&!b.released;
  function decorate(b,ownerId,birdAge=96,status='racing'){
    return Object.assign(b,{ownerId,breederId:ownerId,age:birdAge,status,released:status==='wild',earnings:0,rating:0,gradedWins:0,lastRaceWeek:-10,listed:false,offspring:0,pregnancy:null,plan:{training:'balanced',race:true,retire:true}});
  }
  function create(s,ownerId,name,sex,years,status,seed){
    const random=rng(seed),pick=a=>a[Math.floor(random()*a.length)];
    const b=M.initialize({id:`world-${s.serial++}`,name,sex,gen:1,age:years*YEAR,genes:{distance:[...pick(['SS','SL','LL'])],color:[...pick(['Bb','CC','bb'])]},condition:100,parents:[],races:0,wins:0,trainedWeek:-1,released:false},[pick([0,1,2]),pick([0,1,2]),pick([0,1,2])],random,status!=='young');
    decorate(b,ownerId,years*YEAR,status);s.birds.push(b);return b;
  }
  function setup(s){
    s.version=3;s.serial=1;s.owners=[{id:'player',name:'あなた',farm:'羽風牧場',money:0},...PROFILES.map(([id,name,farm,prefix])=>({id,name,farm,prefix,money:60000}))];
    s.debt=0;s.ledger=[];s.news=[];s.results=[];s.pendingRace=null;s.mode='manual';s.trainerId=null;s.lastWeekReport=null;s.entries=[];s.trainingLog=[];s.monthly=[];
    for(const o of s.owners.slice(1)){
      for(let i=0;i<24;i++){
        const status=i>=20?'young':i>=16?'breeding':'racing';
        const years=status==='young'?i%2:status==='breeding'?6+i%3:2+i%6;
        const b=create(s,o.id,o.prefix+SUFFIXES[i%SUFFIXES.length]+(i>=20?'ジュニア':''),i%2?'F':'M',years,status,o.id+i);
        if(status==='racing'&&i>=4){
          b.races=5+i;b.wins=1+Math.floor((i-4)/3);b.rating=[400,400,800,800,1400,1400,2000,2000,3000,3000,4000,4000][i-4];b.earnings=b.rating*5;b.gradedWins=i>=14?1:0;
        }else if(status==='breeding'){b.races=20;b.wins=4;b.earnings=10000+(i-16)*2500;b.rating=2400;}
        b.listed=status==='young'||status==='breeding'||i===2||i===5;
      }
    }
    for(const o of s.owners.slice(1)){
      const bs=owned(s,o.id),father=bs.find(b=>b.status==='breeding'&&b.sex==='M'),mother=bs.find(b=>b.status==='breeding'&&b.sex==='F');
      for(const b of bs.filter(b=>b.status==='young')){M.inherit(b,father,mother,rng(b.id+'genes'));b.parents=[father.id,mother.id];b.gen=2;}
    }
    log(s,'年間48週の競羽生活が始まりました。番組表・羽市場・調教師・収支帳を確認しましょう。');
    return s;
  }
  function initial(playerBirds,{trainerId=null}={}){
    const s={version:3,week:1,money:12000,births:0,history:[],birds:playerBirds};
    playerBirds.forEach((b,i)=>decorate(b,'player',(i>=4?6:2+i%2)*YEAR,i>=4?'breeding':'racing'));
    setup(s);
    if(trainerId){const t=TRAINERS.find(t=>t.id===trainerId);s.trainerId=t.id;s.mode='auto';log(s,`${t.name}が開業時から専属で調教を担当します。週給${t.weekly} G。`);planRaces(s);}
    return s;
  }
  function migrate(input){
    if(input?.version===3){
      const e=input.pendingRace?.event;
      input.entries||=[];input.trainingLog||=[];input.monthly||=[];
      // Discard obsolete player pacing choices when reading legacy saves.
      for(const entry of input.entries)delete entry.tactic;
      if(input.pendingRace)delete input.pendingRace.tactic;
      for(const r of [...(input.results||[]),...(e?[e]:[])])if(OLD_TRACKS[r.trackId])r.trackId=OLD_TRACKS[r.trackId];
      for(const b of input.birds||[])if(b.pregnancy)b.pregnancy.dueWeek=Math.min(b.pregnancy.dueWeek,input.week+GESTATION);
      if(!validState(input))throw Error('Invalid world save');return input;
    }
    const legacy=M.migrate(input),s=JSON.parse(JSON.stringify(legacy));
    for(const b of s.birds){
      const oldAge=b.age,wasReleased=b.released;
      decorate(b,'player',oldAge<2?oldAge*YEAR:Math.min(9*YEAR,2*YEAR+Math.max(0,oldAge-2)),wasReleased?'wild':oldAge<2?'young':'racing');
      b.earnings=s.history.filter(h=>h.name===b.name).reduce((n,h)=>n+h.reward,0);
      b.rating=b.wins*400;b.lastRaceWeek=-10;
    }
    setup(s);
    // Reserve funds make the new recurring costs survivable for old low-cash saves.
    account(s,'player',6000,'移行準備金','年間経営版への一度限りの準備金');
    log(s,'旧データを移行。成鳥は2歳以上、幼鳥は0〜1歳へ換算しました。名前・血統・戦績・能力上限を保持しています。');
    return s;
  }
  function event(week,key,name,level,trackId,distance,surface,minAge=2,maxAge=9,sex=null){
    const d=date(week),t=TRACKS[trackId],c=CLASSES[level];
    return {id:`${week}:${key}`,week,name,level,trackId,distance,surface,minAge,maxAge,sex,label:distance<=1600?'短距離':distance>=2000?'長距離':'万能',track:t,hill:t.hill,wind:t.wind,heat:d.month>=6&&d.month<=9?t.heat:0,going:d.week%9===0?'heavy':'good',fee:c.fee,allowance:c.allowance,purse:[c.prize,Math.round(c.prize*.4),Math.round(c.prize*.25),Math.round(c.prize*.15),Math.round(c.prize*.1),0]};
  }
  function calendar(week){
    const d=date(week),ids=Object.keys(TRACKS),tid=ids[(d.month-1)%ids.length],surface=TRACKS[tid].surface;
    const list=Object.keys(CLASSES).slice(0,6).map((k,i)=>event(week,k,`${CLASSES[k].name} ${i%2?'中長距離':'短距離'}`,k,tid,i%2?2200:1400,surface));
    // The first stakes keeps the 'stakes' key so saved results stay linked.
    STAKES.filter(x=>x[0]===d.week).forEach((row,i)=>{
      const [,n,l,t,dist,s,min,max,sex,referenceName]=row;
      const e=event(week,i?`stakes${i+1}`:'stakes',n,l,t,dist,s,min,max,sex);
      if(referenceName)Object.assign(e,{referenceName,circuit:REGIONAL_STAKES.includes(row)?'regional':'central'});
      list.push(e);
    });
    return list;
  }
  function eventById(id){const week=parseInt(id,10);return week>0?calendar(week).find(e=>e.id===id):undefined;}
  const resultFor=(s,eventId)=>s.results.find(r=>r.eventId===eventId);
  function eligibility(s,b,e){
    if(!b||b.status!=='racing'||b.released)return'競走羽のみ出走できます';
    if(age(b)<e.minAge||age(b)>e.maxAge)return`${e.minAge}〜${e.maxAge}歳限定`;
    if(e.sex&&b.sex!==e.sex)return'牝羽限定';
    if(b.lastRaceWeek===s.week)return'今週は出走済み';
    if(b.strain>=70)return'脚の負担が高いため休養が必要';
    if(b.condition<30)return'調子30%以上が必要';
    return classReason(b,e);
  }
  function classReason(b,e){
    const cl=currentClass(b);
    if(e.level==='new'&&cl!=='new')return'未出走の競走羽限定';
    if(e.level==='maiden'&&!(cl==='new'||cl==='maiden'))return'未勝利の競走羽限定';
    if(['c1','c2','c3'].includes(e.level)&&cl!==e.level)return`${CLASSES[e.level].name}限定（収得賞金で判定）`;
    if(e.level==='open'&&cl!=='open')return'収得賞金1,600 G超が必要';
    if(e.level.startsWith('G')&&(b.wins===0||b.rating<(e.maxAge<=3?400:1000)))return e.maxAge<=3?'1勝以上・収得賞金400 G以上が必要':'収得賞金1,000 G以上が必要';
    return'';
  }
  function field(s,e,playerBird){
    const random=rng(e.id),pool=s.birds.filter(b=>b.ownerId!=='player'&&!eligibility(s,b,e)&&s.week-b.lastRaceWeek>=2&&b.condition>=60&&cash(s,b.ownerId)>=e.fee).map(b=>({b,n:random()})).sort((a,b)=>a.n-b.n);
    return [...(playerBird?[playerBird]:[]),...pool.slice(0,playerBird?5:6).map(x=>x.b)];
  }
  const THIN_FIELD='登録羽が不足しています。別の番組か来週を選んでください';
  function canEnter(s,b,e){
    if(!e||e.week!==s.week)return'今週の番組を選んでください';
    if(s.pendingRace)return'進行中の競走があります';
    if(resultFor(s,e.id))return'この競走は確定済み';
    const reason=eligibility(s,b,e);if(reason)return reason;
    if(cash(s,b.ownerId)<e.fee)return'出走料が不足しています';
    if(field(s,e,b).length<2)return THIN_FIELD;
    return'';
  }
  function prepareRace(s,eventId,birdId){
    const e=calendar(s.week).find(x=>x.id===eventId),b=find(s,birdId),reason=canEnter(s,b,e);
    if(reason)throw Error(reason);
    const entrants=field(s,e,b);
    s.entries=s.entries.filter(x=>!(x.birdId===b.id&&x.week===s.week));
    for(const x of entrants){account(s,x.ownerId,-e.fee,'出走料',`${x.name} / ${e.name}`);x.lastRaceWeek=s.week;}
    s.pendingRace={event:e,ids:entrants.map(x=>x.id),seed:`${e.id}:${entrants.map(x=>x.id).join('/')}`};
    return s.pendingRace;
  }
  function makeRunners(s,pending){const random=rng(pending.seed);return pending.ids.map((id,i)=>M.runner(find(s,id),i,random));}
  const formatTime=t=>`${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;
  function finishRace(s,pending,runners){
    if(resultFor(s,pending.event.id))return resultFor(s,pending.event.id);
    const e=pending.event,ordered=[...runners].sort((a,b)=>a.finishedAt-b.finishedAt),rows=[];
    for(let i=0;i<ordered.length;i++){
      const r=ordered[i],b=find(s,r.bird.id),prize=e.purse[i]||0,payment=prize+e.allowance;
      b.races++;b.earnings+=prize;b.lastRaceWeek=s.week;
      if(i===0){b.wins++;b.rating+=CLASSES[e.level].gain;if(e.level.startsWith('G'))b.gradedWins++;}
      account(s,b.ownerId,payment,'競走収入',`${b.name} ${i+1}着 / 賞金${prize}＋出走手当${e.allowance}`);
      M.afterRace(b,e);
      const row={id:b.id,name:b.name,ownerId:b.ownerId,rank:i+1,time:r.finishedAt,prize,allowance:e.allowance,reward:payment};rows.push(row);
      if(b.ownerId==='player'){
        s.history.push({week:s.week,birdId:b.id,name:b.name,course:e.name,rank:i+1,reward:payment,time:r.finishedAt,level:e.level});s.history=s.history.slice(-100);
        log(s,`${b.name}が${e.name}で${i+1}着（${formatTime(r.finishedAt)}）。賞金・手当${payment} G。現在${className(b)}。`);
      }
    }
    const result={eventId:e.id,week:s.week,name:e.name,level:e.level,trackId:e.trackId,rows};
    s.results.push(result);s.results=s.results.slice(-350);s.pendingRace=null;
    return result;
  }
  function simulate(s,pending){
    const rs=makeRunners(s,pending);let t=0;
    while(rs.some(r=>r.finishedAt===null)&&t<1200){t+=.1;M.stepRace(rs,pending.event,t,.1);}
    if(rs.some(r=>r.finishedAt===null))throw Error('競走シミュレーションの時間上限');
    return finishRace(s,pending,rs);
  }
  function retire(s,b,why='競走引退'){
    if(!b||b.status!=='racing')return false;
    b.status='breeding';b.listed=b.ownerId!=='player';s.entries=s.entries.filter(x=>x.birdId!==b.id);
    log(s,`${b.name}（${owner(s,b.ownerId).farm}）が${age(b)}歳で${why}。${roleName(b)}へ。`);return true;
  }
  function parentRecord(s,b){return b.parents.reduce((n,id)=>n+(find(s,id)?.earnings||0),0);}
  function price(s,b){
    if(b.status==='wild')return 0;
    const parents=parentRecord(s,b);
    if(age(b)<2)return Math.round(600+parents*.10);
    if(b.status==='breeding'&&b.sex==='F')return Math.round((800+parents*.04+b.earnings*.12)*Math.max(.25,1-Math.max(0,age(b)-12)*.035));
    if(b.status==='breeding')return Math.round((1000+b.earnings*.18)*Math.max(.25,1-Math.max(0,age(b)-15)*.035));
    return Math.round((1200+b.earnings*.15+b.rating*.2)*Math.max(.25,1-Math.max(0,age(b)-5)*.12));
  }
  const studFee=b=>Math.round(150+b.earnings*.035+b.gradedWins*500);
  const occupied=(s,id='player')=>owned(s,id).length+owned(s,id).filter(b=>b.pregnancy).length;
  function buy(s,id){
    const b=find(s,id);if(s.pendingRace)throw Error('競走確定後に取引できます');
    if(!b||b.ownerId==='player'||!b.listed||b.status==='wild')throw Error('売り出されていません');
    if(occupied(s)+(b.pregnancy?2:1)>CAPACITY)throw Error('羽房が不足しています。出産予定の羽房も確保が必要です');
    const amount=price(s,b);if(s.money<amount)throw Error('購入資金が不足しています');
    account(s,'player',-amount,'購入',b.name);account(s,b.ownerId,amount,'売却',b.name);
    b.ownerId='player';b.listed=false;log(s,`${b.name}を${amount} Gで購入しました。`);return b;
  }
  function sell(s,id){
    const b=find(s,id);if(s.pendingRace)throw Error('競走確定後に取引できます');
    if(!b||b.ownerId!=='player'||b.status==='wild')throw Error('所有羽を選んでください');
    const amount=price(s,b),buyer=s.owners.slice(1).filter(o=>o.money>=amount&&owned(s,o.id).length<180).sort((a,b)=>b.money-a.money)[0];
    if(!buyer)throw Error('現在、購入できる羽主がいません');
    account(s,buyer.id,-amount,'購入',b.name);account(s,'player',amount,'売却',b.name);
    b.ownerId=buyer.id;b.listed=false;s.entries=s.entries.filter(x=>x.birdId!==b.id);log(s,`${b.name}を${buyer.name}へ${amount} Gで売却。血統と戦績は残ります。`);return amount;
  }
  function breedingReason(s,sire,dam,ownerId='player'){
    if(!sire||!dam||!fertile(sire)||!fertile(dam)||sire.sex!=='M'||dam.sex!=='F')return'3〜30歳の種牡羽と繁殖牝羽が必要です';
    if(dam.ownerId!==ownerId)return'所有する繁殖牝羽を選んでください';
    if(dam.pregnancy)return'この繁殖牝羽は受胎中です';
    if(dam.age+GESTATION>=31*YEAR)return'出産予定が31歳以降になるため種付けできません';
    if(occupied(s,ownerId)>= (ownerId==='player'?CAPACITY:180))return'出産に備えた空き羽房が必要です';
    const cost=200+(sire.ownerId===ownerId?0:studFee(sire));
    if(cash(s,ownerId)<cost)return'種付け資金が不足しています';
    return'';
  }
  function breed(s,sireId,damId,ownerId='player'){
    const sire=find(s,sireId),dam=find(s,damId),reason=breedingReason(s,sire,dam,ownerId);if(reason)throw Error(reason);
    const fee=sire.ownerId===ownerId?0:studFee(sire);
    account(s,ownerId,-200-fee,'種付け',`${dam.name} × ${sire.name}`);
    if(fee)account(s,sire.ownerId,fee,'種付け料',sire.name);
    dam.pregnancy={sireId,dueWeek:s.week+GESTATION,seed:`${s.week}/${dam.id}/${sire.id}`};
    if(ownerId==='player'||sire.ownerId==='player')log(s,`${dam.name}が受胎。${date(s.week+GESTATION).year}年 第${date(s.week+GESTATION).week}週に出産予定。`);
    return dam.pregnancy;
  }
  function foal(s,dam){
    const p=dam.pregnancy,father=find(s,p.sireId),random=rng(p.seed),sex=random()<.5?'M':'F';
    const name=dam.ownerId==='player'?`幼羽${s.births+1}`:`${owner(s,dam.ownerId).prefix}${SUFFIXES[s.serial%SUFFIXES.length]}${date(s.week).year}`;
    const b=create(s,dam.ownerId,name,sex,0,'young',p.seed);
    M.inherit(b,father,dam,random);b.parents=[father.id,dam.id];b.gen=Math.max(father.gen,dam.gen)+1;
    father.offspring++;dam.offspring++;dam.pregnancy=null;b.listed=dam.ownerId!=='player';
    if(dam.ownerId==='player'){s.births++;log(s,`${dam.name}が${b.name}（${sex==='M'?'牡':'牝'}）を出産しました。`);}
    return b;
  }
  function maintenance(s){const birds=owned(s);return{feed:birds.reduce((n,b)=>n+(b.status==='young'?2:b.status==='racing'?6:4),0),stable:20,trainer: s.mode==='auto'?(trainer(s)?.weekly||0):0,interest:Math.ceil(s.debt*.002)};}
  function hire(s,id){const t=TRAINERS.find(t=>t.id===id);if(!t)throw Error('調教師を選んでください');if(s.money<t.hire)throw Error('契約金が不足しています');account(s,'player',-t.hire,'調教師契約',t.name);s.trainerId=id;s.mode='auto';log(s,`${t.name}と契約。週給${t.weekly} G。自動運営を開始しました。`);planRaces(s);}
  function setMode(s,mode){
    if(mode==='auto'&&!trainer(s))throw Error('先に調教師と契約してください');
    s.mode=mode;
    if(mode==='auto')planRaces(s);else s.entries=s.entries.filter(x=>x.by!=='trainer');
  }
  function loan(s){if(s.debt>=20000)throw Error('融資枠の上限です。売却や出走収入で資金を確保してください');const amount=Math.min(5000,20000-s.debt);s.debt+=amount;account(s,'player',amount,'融資','運転資金融資');}
  function repay(s){const n=Math.min(1000,s.debt,s.money);if(!n)throw Error('返済可能な資金・借入がありません');account(s,'player',-n,'返済','運転資金返済');s.debt-=n;}
  const raceGap=s=>s.trainerId==='veteran'?4:3;
  // Reservations are checked against the age the bird will have that week; condition and field size are checked on race day.
  function reserveReason(s,b,e){
    if(!e)return'番組を選んでください';
    if(e.week<s.week)return'過去の番組です';
    if(e.week>=s.week+RESERVE_WEEKS)return`${RESERVE_WEEKS}週先まで予約できます`;
    if(!b||b.ownerId!=='player')return'所有羽を選んでください';
    const years=Math.floor((b.age+e.week-s.week)/YEAR);
    if(b.released||!(b.status==='racing'||b.status==='young'&&years>=2))return'競走羽のみ出走できます';
    if(years<e.minAge||years>e.maxAge)return`${e.minAge}〜${e.maxAge}歳限定`;
    if(e.sex&&b.sex!==e.sex)return'牝羽限定';
    const reason=classReason(b,e);if(reason)return reason;
    if(resultFor(s,e.id))return'この競走は確定済み';
    if(e.week===s.week&&b.lastRaceWeek===s.week)return'今週は出走済み';
    if(s.entries.some(x=>x.birdId===b.id&&x.week===e.week))return'同じ週に出走予定があります';
    if(s.entries.some(x=>x.eventId===e.id))return'この競走には自牧場の出走予定があります';
    return'';
  }
  function reserve(s,birdId,eventId,by='player'){
    const b=find(s,birdId),e=eventById(eventId),reason=reserveReason(s,b,e);if(reason)throw Error(reason);
    const entry={week:e.week,eventId:e.id,birdId:b.id,by};
    s.entries.push(entry);s.entries.sort((a,c)=>a.week-c.week);return entry;
  }
  function cancelEntry(s,birdId,week){const n=s.entries.length;s.entries=s.entries.filter(x=>!(x.birdId===birdId&&x.week===week));return s.entries.length<n;}
  function bestEvent(s,b,week){
    const st=M.stats(b),apt=b.genes.distance.every(x=>x==='S')?'短距離':b.genes.distance.every(x=>x==='L')?'長距離':'万能';
    const score=e=>st[e.surface]+(e.label===apt?25:0)+(e.level.startsWith('G')?15:0);
    return calendar(week).filter(e=>!reserveReason(s,b,e)&&cash(s,'player')>=e.fee&&(week===s.week?!canEnter(s,b,e):rivals(s,e)>=2)).sort((a,c)=>score(c)-score(a))[0];
  }
  // Other owners' birds that fit the event's age, sex and class in its week; a rough guide to whether the race will fill.
  const rivals=(s,e)=>s.birds.filter(b=>{const years=Math.floor((b.age+e.week-s.week)/YEAR);return b.ownerId!=='player'&&b.status==='racing'&&years>=e.minAge&&years<=e.maxAge&&(!e.sex||b.sex===e.sex)&&!classReason(b,e);}).length;
  // The trainer keeps one race booked within the next PLAN_WEEKS for each bird allowed to race.
  function planRaces(s){
    if(s.mode!=='auto'||!trainer(s))return;
    const gap=raceGap(s);
    for(const b of owned(s).filter(b=>b.plan.race&&['racing','young'].includes(b.status))){
      const booked=s.entries.filter(x=>x.birdId===b.id).map(x=>x.week);
      if(booked.some(w=>w<s.week+PLAN_WEEKS))continue;
      for(let w=s.week;w<s.week+PLAN_WEEKS;w++){
        if(w-b.lastRaceWeek<gap||booked.some(x=>Math.abs(x-w)<gap))continue;
        if(w===s.week&&(b.condition<75||b.strain>=35))continue;
        const e=bestEvent(s,b,w);
        if(e){reserve(s,b.id,e.id,'trainer');break;}
      }
    }
  }
  // Validates this week's bookings. A race that fails to fill moves to the best open race that week;
  // other failures are dropped with a news line so the schedule never goes stale.
  function dueEntries(s){
    const due=[];
    for(const x of s.entries.filter(x=>x.week===s.week)){
      const b=find(s,x.birdId);let e=eventById(x.eventId);
      let reason=canEnter(s,b,e);
      if(!reason&&x.by==='trainer'&&(b.condition<60||b.strain>=50))reason='調整不足のため回避';
      s.entries.splice(s.entries.indexOf(x),1);
      if(reason===THIN_FIELD){
        const alt=bestEvent(s,b,s.week);
        if(alt){log(s,`${e.name}は登録羽が集まらず不成立。${b.name}は${alt.name}へ回ります。`);x.eventId=alt.id;e=alt;reason='';}
      }
      if(reason){if(b)log(s,`${b.name}の${e?.name||'競走'}への出走を取り消しました（${reason}）。`);continue;}
      s.entries.push(x);due.push({entry:x,event:e,bird:b});
    }
    s.entries.sort((a,c)=>a.week-c.week);
    return due;
  }
  function pruneEntries(s){
    s.entries=s.entries.filter(x=>{const b=find(s,x.birdId);return x.week>=s.week&&b&&b.ownerId==='player'&&['racing','young'].includes(b.status);});
  }
  function trainBird(s,b,menu,target,by){
    const result=M.train(b,menu,s.week,target);
    if(result&&b.ownerId==='player'){
      s.trainingLog.push({week:s.week,birdId:b.id,menu,target:target||null,gain:Object.values(result.gains).reduce((a,n)=>a+n,0),by});
      s.trainingLog=s.trainingLog.slice(-600);
    }
    return result;
  }
  const TRANSFERS=['融資','返済'];
  function monthSummary(s,month){
    const first=month*4+1,last=first+3,d=date(first),inMonth=w=>w>=first&&w<=last;
    const flows=Object.entries(s.monthly.find(m=>m.month===month)?.items||{}).filter(([,n])=>n);
    const income=flows.filter(([k,n])=>n>0&&!TRANSFERS.includes(k)).sort((a,c)=>c[1]-a[1]);
    const expense=flows.filter(([k,n])=>n<0&&!TRANSFERS.includes(k)).sort((a,c)=>a[1]-c[1]);
    const transfers=flows.filter(([k])=>TRANSFERS.includes(k));
    const total=list=>list.reduce((n,[,v])=>n+v,0);
    const birds=owned(s).map(b=>{
      const races=s.history.filter(h=>inMonth(h.week)&&(h.birdId?h.birdId===b.id:h.name===b.name));
      const training=[];
      for(const t of s.trainingLog.filter(t=>t.birdId===b.id&&inMonth(t.week))){
        const name=M.MENUS.find(m=>m.key===t.menu).name+(t.target?`（${M.LABELS[t.target]}重点）`:'');
        let row=training.find(r=>r.name===name);
        if(!row)training.push(row={name,count:0,gain:0});
        row.count++;row.gain+=t.gain;
      }
      const upcoming=s.entries.filter(x=>x.birdId===b.id&&x.week>last&&x.week<=last+4).map(x=>({...x,event:eventById(x.eventId)}));
      return {bird:b,races,training,upcoming};
    });
    return {month,year:d.year,monthNo:d.month,first,last,income,expense,transfers,totalIncome:total(income),totalExpense:-total(expense),net:total(income)+total(expense),birds};
  }
  function npcBusiness(s){
    const d=date(s.week);
    if(d.week===10){
      for(const o of s.owners.slice(1)){
        const herd=owned(s,o.id);if(herd.filter(b=>b.status==='young').length>=8)continue;
        const mares=herd.filter(b=>fertile(b)&&b.sex==='F'&&!b.pregnancy).slice(0,3);
        const studs=s.birds.filter(b=>fertile(b)&&b.sex==='M').sort((a,b)=>b.earnings-a.earnings);
        for(const dam of mares){const sire=studs.find(b=>!dam.parents.includes(b.id)&&!b.parents.includes(dam.id)&&!breedingReason(s,b,dam,o.id));if(sire)breed(s,sire.id,dam.id,o.id);}
      }
    }
    if(d.week%4===0){
      const listings=s.birds.filter(b=>b.listed&&b.ownerId!=='player'&&b.status!=='wild');
      const b=listings[(s.week*7)%Math.max(1,listings.length)];
      if(b){const value=price(s,b),buyer=s.owners.slice(1).filter(o=>o.id!==b.ownerId&&o.money>value+2000&&owned(s,o.id).length<180).sort((a,b)=>owned(s,a.id).length-owned(s,b.id).length)[0];if(buyer){account(s,buyer.id,-value,'購入',b.name);account(s,b.ownerId,value,'売却',b.name);b.ownerId=buyer.id;b.listed=false;log(s,`${buyer.name}が${b.name}を購入しました。`);}}
    }
  }
  function nextWeek(s){
    if(s.pendingRace)throw Error('競走の確定を待ってください');
    const oldWeek=s.week,before=s.money,events=calendar(s.week),auto=s.mode==='auto'&&trainer(s);
    // Booked races not watched in the UI are settled here with the same race model.
    for(const {entry,event,bird} of dueEntries(s)){
      const reason=canEnter(s,bird,event);
      if(reason){cancelEntry(s,bird.id,entry.week);log(s,`${bird.name}の${event.name}への出走を取り消しました（${reason}）。`);continue;}
      simulate(s,prepareRace(s,event.id,bird.id));
    }
    // Other owners run the same race model; no temporary rival birds are generated.
    for(const e of events){
      if(resultFor(s,e.id))continue;
      const entrants=field(s,e).filter(b=>s.week-b.lastRaceWeek>=2&&b.condition>=60);
      if(entrants.length<2)continue;
      for(const b of entrants){account(s,b.ownerId,-e.fee,'出走料',e.name);b.lastRaceWeek=s.week;}
      const pending={event:e,ids:entrants.map(b=>b.id),seed:`npc/${e.id}`};simulate(s,pending);
    }
    // Player birds not trained by hand this week get their plan menu from ranch staff, or the trainer's choice in auto mode.
    for(const b of s.birds.filter(b=>b.status!=='wild')){
      if(b.status==='breeding'||b.lastRaceWeek===s.week||b.condition<70||b.strain>=40||b.age<YEAR)continue;
      const player=b.ownerId==='player';
      let menu=b.plan.training;
      if(!player||auto&&s.trainerId!=='apprentice'){
        menu=M.MENUS.filter(m=>m.key!=='balanced').sort((a,c)=>c.traits.reduce((n,k)=>n+M.trainingRoom(b,k),0)-a.traits.reduce((n,k)=>n+M.trainingRoom(b,k),0))[0].key;
      }
      if(player)trainBird(s,b,menu,null,auto?'trainer':'staff');else M.train(b,menu,s.week);
    }
    const bill=maintenance(s);
    for(const [key,n] of Object.entries(bill))if(n)account(s,'player',-n,{feed:'飼料費',stable:'維持費',trainer:'調教師給与',interest:'利息'}[key],`第${date(s.week).year}年 第${date(s.week).week}週`);
    for(const o of s.owners.slice(1))account(s,o.id,-(20+owned(s,o.id).length*4),'維持費','週次経費');
    npcBusiness(s);s.week++;
    for(const b of [...s.birds]){
      if(b.status==='wild')continue;
      M.nextWeek(b);
      if(b.pregnancy&&b.pregnancy.dueWeek<=s.week)foal(s,b);
      if(age(b)>=31){b.status='wild';b.released=true;b.listed=false;b.pregnancy=null;if(b.ownerId==='player')log(s,`${b.name}が31歳になり、野生へ帰りました。血統記録は残ります。`);continue;}
      if(b.status==='young'&&age(b)>=2){b.status='racing';if(b.ownerId==='player')log(s,`${b.name}が2歳になりました。新羽戦に出走できます。`);}
      if(b.status==='racing'){
        if(age(b)>=10)retire(s,b,'年齢による競走引退');
        else if(age(b)>=4&&age(b)<=6&&(b.gradedWins>0||b.wins>=4)&&(b.ownerId!=='player'||auto&&b.plan.retire))retire(s,b,'好成績を収め競走引退');
      }
    }
    pruneEntries(s);if(auto)planRaces(s);
    if(s.debt>0)log(s,`借入・未払金 ${s.debt} G。売却や出走収入での返済を検討しましょう。`);
    const races=s.history.filter(h=>h.week===oldWeek);
    s.lastWeekReport={week:oldWeek,income:s.ledger.filter(l=>l.week===oldWeek&&l.amount>0).reduce((n,l)=>n+l.amount,0),expense:Object.values(bill).reduce((a,b)=>a+b,0),balanceChange:s.money-before,races:races.length};
    return s.lastWeekReport;
  }
  function validState(s){
    if(!s||s.version!==3||!Number.isInteger(s.week)||s.week<1||!Number.isInteger(s.serial)||s.serial<1||!Number.isFinite(s.money)||s.money<0||!Number.isFinite(s.debt)||s.debt<0||!Number.isInteger(s.births)||s.births<0||!Array.isArray(s.birds)||s.birds.length<2||s.birds.length>10000||!Array.isArray(s.owners)||s.owners.length!==7||new Set(s.owners.map(o=>o.id)).size!==7||!s.owners.some(o=>o.id==='player')||!s.owners.every(o=>typeof o.name==='string'&&typeof o.farm==='string'&&Number.isFinite(o.money))||!['auto','manual'].includes(s.mode)||!(s.trainerId===null||TRAINERS.some(t=>t.id===s.trainerId))||s.mode==='auto'&&!s.trainerId)return false;
    if(new Set(s.birds.map(b=>b.id)).size!==s.birds.length||!s.birds.every(b=>M.validBird(b)&&s.owners.some(o=>o.id===b.ownerId)&&s.owners.some(o=>o.id===b.breederId)&&['young','racing','breeding','wild'].includes(b.status)&&b.released===(b.status==='wild')&&['earnings','rating','gradedWins','offspring'].every(k=>Number.isInteger(b[k])&&b[k]>=0)&&Number.isInteger(b.lastRaceWeek)&&typeof b.listed==='boolean'&&b.plan&&M.MENUS.some(m=>m.key===b.plan.training)&&typeof b.plan.race==='boolean'&&typeof b.plan.retire==='boolean'&&(b.parents.length===0||b.parents.length===2&&b.parents.every(id=>s.birds.some(p=>p.id===id&&p.gen<b.gen)))&&(b.pregnancy===null||b.sex==='F'&&b.status==='breeding'&&Number.isInteger(b.pregnancy.dueWeek)&&b.pregnancy.dueWeek>s.week&&typeof b.pregnancy.seed==='string'&&s.birds.some(p=>p.id===b.pregnancy.sireId&&p.sex==='M'))))return false;
    if(occupied(s)>CAPACITY)return false;
    if(!Array.isArray(s.history)||!s.history.every(h=>typeof h.name==='string'&&typeof h.course==='string'&&Number.isFinite(h.reward)&&Number.isInteger(h.rank)&&h.rank>=1&&h.rank<=6&&Number.isInteger(h.week)))return false;
    if(!Array.isArray(s.ledger)||!s.ledger.every(l=>Number.isFinite(l.amount)&&Number.isInteger(l.week)&&typeof l.category==='string'&&typeof l.note==='string')||!Array.isArray(s.news)||!s.news.every(n=>Number.isInteger(n.week)&&typeof n.message==='string')||!Array.isArray(s.results)||!s.results.every(r=>typeof r.eventId==='string'&&typeof r.name==='string'&&Number.isInteger(r.week)&&CLASSES[r.level]&&TRACKS[r.trackId]&&Array.isArray(r.rows)&&r.rows.every(x=>typeof x.name==='string'&&typeof x.ownerId==='string'&&Number.isInteger(x.rank)&&Number.isFinite(x.time))))return false;
    if(!Array.isArray(s.entries)||!s.entries.every(x=>Number.isInteger(x.week)&&x.week>=s.week&&typeof x.eventId==='string'&&parseInt(x.eventId,10)===x.week&&['player','trainer'].includes(x.by)&&s.birds.some(b=>b.id===x.birdId&&b.ownerId==='player')))return false;
    if(!Array.isArray(s.trainingLog)||!s.trainingLog.every(t=>Number.isInteger(t.week)&&typeof t.birdId==='string'&&M.MENUS.some(m=>m.key===t.menu)&&Number.isInteger(t.gain)))return false;
    if(!Array.isArray(s.monthly)||!s.monthly.every(m=>Number.isInteger(m.month)&&m.items&&typeof m.items==='object'&&Object.values(m.items).every(Number.isFinite)))return false;
    if(s.pendingRace){const p=s.pendingRace,e=calendar(s.week).find(e=>e.id===p.event?.id);if(!e||JSON.stringify(e)!==JSON.stringify(p.event)||typeof p.seed!=='string'||!Array.isArray(p.ids)||p.ids.length<2||p.ids.length>6||new Set(p.ids).size!==p.ids.length||!p.ids.every(id=>s.birds.some(b=>b.id===id&&b.status==='racing'))||resultFor(s,e.id))return false;}
    return true;
  }
  return {YEAR,CAPACITY,GESTATION,PLAN_WEEKS,RESERVE_WEEKS,TRACKS,CLASSES,STAKES,TRAINERS,age,date,owned,owner,find,cash,trainer,currentClass,className,roleName,fertile,initial,migrate,calendar,eligibility,canEnter,field,prepareRace,makeRunners,finishRace,simulate,resultFor,formatTime,retire,price,studFee,occupied,buy,sell,breed,breedingReason,maintenance,hire,setMode,loan,repay,nextWeek,validState,log,monthOf,eventById,reserveReason,reserve,cancelEntry,planRaces,dueEntries,trainBird,monthSummary,rivals};
});
