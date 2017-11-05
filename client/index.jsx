import React from 'react';
import ReactDOM from 'react-dom';

import Table from './components/Table';
import './styles/main.scss';

window.panelCreated = function (devtools) {

    // TODO register listeners

    console.log(devtools);

    ReactDOM.render(<Table/>, document.getElementById('root'));
};
