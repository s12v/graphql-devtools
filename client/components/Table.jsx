import React from 'react';
import ReactTable from "react-table";

import 'react-table/react-table.css'
import './styles/table.scss';

export default class Table extends React.Component {
    constructor() {
        super();
        this.state = {
            data: [
                {
                    query: 'MyQuery',
                    test: "foo",
                },

                {
                    query: '-',
                    test: "bar",
                },

            ]
        };
    }

    render() {
        const { data } = this.state;
        const columns = [{
            Header: 'Query',
            accessor: 'query'
        }, {
            Header: 'Hm',
            accessor: 'test',
            //Cell: props => <span className='number'>{props.value}</span> // Custom cell components!
        }];

        return <ReactTable
            className="-striped -highlight"
            showPagination={false}
            sortable={false}
            data={data}
            columns={columns}
        />
    }
}
