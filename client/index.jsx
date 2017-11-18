import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import fake_devtools from './test/InBrowser.js';
import './styles/main.scss';

/**
 * @param devtools chrome.devtools
 */
window.panelCreated = function (devtools) {

    ReactDOM.render(
        <App
            onRequestFinished={devtools.network.onRequestFinished}
        />,
        document.getElementById('root')
    );
};


if (chrome && typeof chrome.devtools === 'undefined') {
    panelCreated(fake_devtools);
}
