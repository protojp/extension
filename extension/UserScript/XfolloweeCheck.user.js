// ==UserScript==
// @name         X非相互フォローチェック
// @namespace    http://proto.jp/
// @version      0.1
// @description  X非相互フォローチェック
// @author       @proto_jp
// @match        https://twitter.com/*/following*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @grant        none
// @require      https://code.jquery.com/jquery-3.3.1.slim.min.js
// ==/UserScript==

(function() {
    'use strict';

    setInterval(() => {
        $("div[data-testid='cellInnerDiv']").has("span:contains('フォローされています')").remove();
    }, 2000);

})();