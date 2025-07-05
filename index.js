const puppeteer = require('puppeteer');
const path = require('path');
const readline = require('readline');

// 除外するパビリオン名の配列
const EXCLUDED_PAVILIONS = [
  '車いす',
  '障がい者',
  'バリアフリー',
  '未来の都市',
  // '13歳',
  // 'セルビア',
  '三菱',
  'ブルーオーシャン',
  'いのちの未来',
  'いのちのあかし',
  '国連パビリオン',
  'ポルトガル',
  'アラブ',
  '障害',
  'English',
  '赤十字',
  'アイヌ',
  '関西パビリオン'
];

// 予約可能時間帯の制限（24時間表記）
const RESERVATION_TIME_LIMIT = 19;

// 時間が制限時間内かチェックする関数
const isWithinTimeLimit = (timeStr) => {
  const timeMatch = timeStr.match(/(\d+):(\d+)/);
  if (!timeMatch) return false;
  const hour = parseInt(timeMatch[1]);
  return hour < RESERVATION_TIME_LIMIT;
};

// ランダムな待機時間を生成する関数
const randomDelay = async (min = 1000, max = 3000) => { 
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
};

// ターミナルからの入力を待機する関数
const waitForInput = async (prompt) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

(async () => {
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null,
    userDataDir: path.join(process.env.HOME, 'Library/Application Support/Google/Chrome/Default'),
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });
  
  const page = await browser.newPage();
  
  // ユーザーエージェントを設定
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.93 Safari/537.36');
  
  // 自動化検出を回避
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ja-JP', 'ja', 'en-US', 'en']
    });
  });

  try {
    // 初期ページにアクセス
    await page.goto('https://ticket.expo2025.or.jp/myticket/', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    // await page.goto('https://ticket.expo2025.or.jp/myticket/https://ticket.expo2025.or.jp/ticket_selection/?screen_id=018&lottery=4', {
    //   waitUntil: 'networkidle0',
    //   timeout: 60000
    // });
    await randomDelay(2000, 3000);

    // ターミナルでワンタイムパスワードの入力を待機
    console.log('パビリオン検索ページへの遷移を待機中...');
    await waitForInput('パビリオン検索ページに移動したら、Enterキーを押してください: ');
    await randomDelay(2000, 3000);

    let visitedTitles = [];
    let isFirstRun = true;
    while (true) {
      if (isFirstRun) {
        // 1回目はパビリオンを選択
        try {
          const selectSelector = 'select[data-selector="refining"]';
          await page.waitForSelector(selectSelector, { visible: true, timeout: 30000 });
          await randomDelay(1000, 2000);
          
          // パビリオンを選択（value="1"）
          await page.select(selectSelector, '1');
          console.log('パビリオンを選択しました。');
          await randomDelay(2000, 3000);
          isFirstRun = false;
        } catch (error) {
          console.log('セレクトボックスが見つからないか、すでにパビリオンが選択されています。処理を続行します。');
          isFirstRun = false;
        }
      } else {
        // 2回目以降は検索ボタンをクリック
        const searchButtonSelector = 'button[class^="basic-btn type2 style_search_btn__"]';
        try {
          await page.waitForSelector(searchButtonSelector, { visible: true, timeout: 30000 });
          await randomDelay(1000, 2000);
          await page.click(searchButtonSelector);
          await randomDelay(2000, 3000);
        } catch (error) {
          console.log('検索ボタンが見つからないか、すでに検索結果が表示されています。処理を続行します。');
        }
      }
      // 選択/検索時にvisitedTitlesをリセット
      visitedTitles = [];

      // もっと見るボタンを7回クリックしながらリストを都度取得
      const moreButtonSelector = 'button.basic-btn.type4.style_more_btn__ymb22';
      let found = false;
      for (let i = 0; i < 7; i++) {
        console.log(`もっと見るボタンをクリック: ${i + 1}回目`);
        // リストを取得
        const items = await page.$$eval('button[class^="basic-btn type1 style_search_item__"]', (nodes, excludedPavilions) => {
          return nodes.map((node, i) => {
            const img = node.querySelector('img');
            const title = node.querySelector('span[class^="style_search_item_title__"]');
            return {
              img: img ? img.src : '',
              title: title ? title.textContent.trim() : '',
              index: i
            };
          }).filter(item => {
            return item.title && !excludedPavilions.some(word => item.title.includes(word));
          });
        }, EXCLUDED_PAVILIONS);
        const itemHandles = await page.$$('button[class^="basic-btn type1 style_search_item__"]');

        // console.log('\n現在のパビリオンリスト:');
        // items.forEach((item, index) => {
        //   let mark = '';
        //   if (item.img.includes('calendar_few')) mark = '△';
        //   if (item.img.includes('calendar_ok')) mark = '◯';
        //   console.log(`${index + 1}: ${item.title} ${mark}`);
        // });
        // console.log('------------------------\n');

        for (let idx = 0; idx < items.length; idx++) {
          let mark = '';
          if (items[idx].img.includes('calendar_few')) mark = '△';
          if (items[idx].img.includes('calendar_ok')) mark = '◯';
          // 既に開いたタイトルはスキップ
          if (mark && !visitedTitles.includes(items[idx].title)) {
            found = true;
            console.log(`${idx + 1}: ${items[idx].title} ${mark}`);
            visitedTitles.push(items[idx].title);
            // 正しいボタンをクリック
            try {
              // パビリオンボタンを探す（より確実な方法）
              const buttons = await page.$$('button.basic-btn.type1.style_search_item__zndDR');
              if (buttons && buttons.length > items[idx].index) {
                console.log('パビリオンボタンをクリックします...');
                const currentUrl = page.url();
                
                // ボタンが表示されるまでスクロール
                await buttons[items[idx].index].evaluate(button => {
                  button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                await randomDelay(1000, 2000);
                
                // クリックを実行
                await buttons[items[idx].index].click();
                console.log('クリックを実行しました。');
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                let times = [];
                try {
                  // 時間帯リストを取得
                  times = await page.$$eval('div[class^="style_time_picker__row__"]', rows => {
                    return rows.map(row => {
                      const img = row.querySelector('img');
                      const time = row.querySelector('label span:last-child');
                      const error = row.parentElement.querySelector('p[class^="style_time_picker__error__"]');
                      let mark = '';
                      if (img && img.src.includes('calendar_few')) mark = '△';
                      if (img && img.src.includes('calendar_ok')) mark = '◯';
                      let errorMsg = '';
                      if (error) errorMsg = '（予約希望数を確保できません）';
                      return {
                        time: time ? time.textContent.trim() : '',
                        mark: mark,
                        error: errorMsg
                      };
                    }).filter(item => item.time);
                  });

                  if (times.length > 0) {
                    console.log('利用可能な時間帯:');
                    times.forEach(t => {
                      console.log(`${t.time} ${t.mark}${t.error}`);
                    });
                    
                    // 予約可能な時間帯を探す（制限時間内のもののみ）
                    const availableTime = times.find(t => 
                      (t.mark === '◯' || t.mark === '△') && 
                      !t.error && 
                      isWithinTimeLimit(t.time)
                    );
                    if (availableTime) {
                      console.log(`予約可能な時間帯を見つけました: ${availableTime.time} (${availableTime.mark})`);
                      
                      // 利用可能な時間帯までスクロール
                      await page.evaluate((time) => {
                        const labels = Array.from(document.querySelectorAll('label'));
                        const targetLabel = labels.find(label => label.textContent.includes(time));
                        if (targetLabel) {
                          targetLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }, availableTime.time);
                      await randomDelay(1000, 2000);
                      
                      // ラジオボタンをクリック（セレクターを修正）
                      const clicked = await page.evaluate((time) => {
                        const labels = Array.from(document.querySelectorAll('label'));
                        const targetLabel = labels.find(label => label.textContent.includes(time));
                        if (targetLabel) {
                          targetLabel.click();
                          return true;
                        }
                        return false;
                      }, availableTime.time);

                      if (clicked) {
                        await randomDelay(2000, 3000);

                        // 申し込みボタンをクリック
                        const submitButtonSelector = 'button[class^="basic-btn type2 style_reservation_next_link__"]';
                        await page.waitForSelector(submitButtonSelector, { timeout: 300000 });
                        await page.click(submitButtonSelector);
                        await randomDelay(2000, 3000);

                        // 確認ダイアログの処理
                        // const confirmButtonSelector = 'button[class^="basic-btn type1 style_confirm_btn__"]';
                        // await page.waitForSelector(confirmButtonSelector, { timeout: 300000 });
                        // await page.click(confirmButtonSelector);
                        
                        // 予約失敗モーダルのチェック
                        try {
                          const modalSelector = 'div.ReactModal__Content--after-open';
                          
                          // モーダルが表示されるのを待機（短いタイムアウト）
                          await page.waitForSelector(modalSelector, { timeout: 5000 });
                          console.log('予約失敗のモーダルを検出しました。閉じて再開します。');
                          
                          // モーダルを閉じる（両方の閉じるボタンを試す）
                          await page.evaluate(() => {
                            // 右上の×ボタン
                            const closeButton1 = document.querySelector('a.style_close__lYrCO');
                            if (closeButton1) {
                              closeButton1.click();
                              return;
                            }
                            
                            // 下部の「とじる」ボタン
                            const closeButton2 = document.querySelector('a.basic-btn.type3.modal-close');
                            if (closeButton2) {
                              closeButton2.click();
                              return;
                            }
                            
                            // どちらも見つからない場合はモーダルの外側をクリック
                            const modal = document.querySelector('div.ReactModal__Content--after-open');
                            if (modal) {
                              const rect = modal.getBoundingClientRect();
                              const clickX = rect.left - 10;
                              const clickY = rect.top - 10;
                              const clickEvent = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window,
                                clientX: clickX,
                                clientY: clickY
                              });
                              document.elementFromPoint(clickX, clickY)?.dispatchEvent(clickEvent);
                            }
                          });
                          
                          console.log('モーダルを閉じる処理を実行しました。');
                          await randomDelay(3000, 4000);
                          
                          // モーダルが完全に閉じるのを待機
                          try {
                            await page.waitForSelector(modalSelector, { hidden: true, timeout: 5000 });
                            console.log('モーダルが完全に閉じられました。');
                          } catch (error) {
                            console.log('モーダルが閉じられていないようです。強制的に続行します。');
                          }
                          
                          // 戻るボタンをクリック
                          const backBtnSelector = 'a[class^="basic-btn type3 style_back_btn__"]';
                          await page.waitForSelector(backBtnSelector, { visible: true });
                          await page.click(backBtnSelector);
                          await randomDelay(2000, 3000);
                          continue;
                        } catch (modalError) {
                          // モーダルが表示されなかった場合は予約成功
                          console.log('予約申し込みが完了しました！');
                          const now = new Date();
                          console.log('予約完了時刻: ' + now.toLocaleString('ja-JP', { hour12: false }));
                          await waitForInput('続けるにはEnterキーを押してください: ');
                        }
                      } else {
                        console.log('時間帯の選択に失敗しました。');
                      }
                    } else {
                      console.log('予約可能な時間帯が見つかりませんでした。');
                    }
                  } else {
                    console.log('利用可能な時間帯が見つかりませんでした。');
                  }

                  // すべての時間帯が「予約希望数を確保できません」の場合は自動で戻る
                  if (times.length > 0 && times.every(t => t.error)) {
                    console.log('全ての時間帯が予約希望数を確保できません。自動的に戻ります。');
                    visitedTitles.push(items[idx].title);
                    const backBtnSelector = 'a[class^="basic-btn type3 style_back_btn__"]';
                    await page.waitForSelector(backBtnSelector, { visible: true });
                    await page.click(backBtnSelector);
                    await page.waitForNavigation({ waitUntil: 'networkidle0' });
                    await randomDelay(2000, 3000);
                    break;
                  } else {
                    // Enter待機
                    // await waitForInput('続けるにはEnterキーを押してください: ');
                    //10秒待機
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    // 戻るボタンをクリック
                    const backBtnSelector = 'a[class^="basic-btn type3 style_back_btn__"]';
                    await page.waitForSelector(backBtnSelector, { visible: true });
                    await page.click(backBtnSelector);
                    // await page.waitForNavigation({ waitUntil: 'networkidle0' });
                    await randomDelay(2000, 3000);
                    break;
                  }
                } catch (error) {
                  console.log('時間帯リストの取得に失敗しました。');
                  // continue;
                }
              } else {
                console.log('パビリオンボタンが見つかりませんでした。');
                continue;
              }
            } catch (error) {
              console.log('クリックに失敗しましたが、処理を続行します。');
              continue;
            }
          }
        }
        // if (found) break;
        // few/okがなければもっと見るを押す
        try {
          await page.waitForSelector(moreButtonSelector, { visible: true, timeout: 5000 });
          await page.click(moreButtonSelector);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
          console.log('もっと見るボタンが見つからないか、すべての結果が表示されました');
          break;
        }
      }
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await browser.close();
  }
})();
