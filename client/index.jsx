import React from 'react';
import ReactDOM from 'react-dom';

import App from './components/App';
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
