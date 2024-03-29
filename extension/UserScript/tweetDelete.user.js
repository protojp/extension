// ==UserScript==
// @name         X投稿削除
// @namespace    proto.jp
// @version      0.1
// @description  X投稿削除
// @author       proto.jp
// @match        https://twitter.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.6.4/jquery.min.js
// @grant        none
// ==/UserScript==

(function() {
  // 'use strict';
  // Your code here...

  let timerId = setInterval(() => {

    //プロフィールページ判定
    if($('a[href="/i/flow/setup_profile"]').length)
    {
      let deleteCount = 10;
      let delay = 2500;
      let count = 0;
      let hashName = "DelCount";

      clearInterval(timerId);

      //URLハッシュにDelCountがあったらpromot出さない
      deleteCount = window.location.hash.indexOf(hashName)>0  ? window.location.hash.split('=')[1]
                                                              : prompt('削除するPOST数を入れてください。※最大100件。数分ごとリロード実行', deleteCount);

      deleteCount = parseInt(deleteCount,10);

      if(!deleteCount)return;

      deleteCount = deleteCount > 100 ? 100 : deleteCount;

      // console.log(deleteCount);

      const DeleteLastPost = () => {

        if(deleteCount>count){
          count++;

          $('div[aria-haspopup="menu"]')[1].click();
          setTimeout(() => {
            // console.log($('div[data-testid="Dropdown"]>div:first-child'));
            $('div[data-testid="Dropdown"]>div:first-child').click();
            setTimeout(() => {
              $('div[data-testid="confirmationSheetConfirm"]').click();
            }, 200);
          }, 200);
        }

      };

      //delayミリ秒後実行
      setInterval(DeleteLastPost, delay);

      //数分後リロード再実行
      window.setTimeout( function() {
        window.location.hash = hashName+"="+deleteCount;
        window.location.reload();
      }, delay*deleteCount*1.5+Math.random()*1000*60);

    }

  }, 3000);

})();