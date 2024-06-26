// ==UserScript==
// @name         쉘터 정확한 날자 및 시간 표시
// @namespace    https://shelter.id/
// @version      1.0.1
// @description  쉘터 정확한 날자 및 시간 표시
// @author       MaGyul
// @match        https://shelter.id/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shelter.id
// @update       https://raw.githubusercontent.com/MaGyul/test/main/shelter.id.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // history onpushstate setup
    (function(history){
        var pushState = history.pushState;
        history.pushState = function(state) {
            if (typeof history.onpushstate == "function") {
                history.onpushstate({state: state});
            }
            return pushState.apply(history, arguments);
        };
    })(window.history);

    history.onpushstate = updateDate;

    function updateDate() {
        setTimeout(() => {
            let title_li = document.querySelector('.sub-txt > li:nth-child(1)');
            if (!title_li) {
                updateDate();
                return;
            }
            let time_span = title_li.querySelector('.datetime');
            if (!time_span) {
                time_span = document.createElement('span');
                time_span.classList.add('datetime');
                let time = title_li.querySelector('time');
                let datetime = new Date(time.getAttribute('datetime'));
                time_span.textContent = ` (${datetime.toLocaleString()})`;
                title_li.appendChild(time_span);
            }
        }, 200);
    }
})();
