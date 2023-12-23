// ==UserScript==
// @name         X興味関心全チェック外し
// @namespace    proto.jp
// @version      0.1
// @description  X興味関心全チェック外し
// @author       proto.jp
// @match        https://twitter.com/settings/*/twitter_interests
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.6.4/jquery.min.js
// @grant        none
// ==/UserScript==

(function() {
  // 'use strict';

  // Your code here...

  let count=0;
  let IntervalID = setInterval(() => {
    if($('*[aria-labelledby="detail-header"]').length)
    {
      clearInterval(IntervalID);

      $('*[aria-labelledby="detail-header"] label').each(function(_index) {
        if($(this).find("input").is(':checked'))count++;
      })

      if(count==0)return;

      if(window.confirm( "すべてのチェックボックスを外しますか？"))
        $('*[aria-labelledby="detail-header"] label').each(function(_index) {
          if($(this).find("input").is(':checked'))
          {
            $(this).click();
            $(this).find("input").removeAttr("checked").prop("checked", false).change();
          }
        });
    }
    
  }, 2000);

})();