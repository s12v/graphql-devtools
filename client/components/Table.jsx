import HarUtils from "../services/HarUtils";
import React from 'react';
import ReactTable from "react-table";
import formatBytes from "../services/FormatBytes"
import './styles/table.scss';
import { FaBan } from 'react-icons/fa';

export default class Table extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            data: [],
            selectedIndex: -1
        };
    }
   
    clearTable () {
      this.setState(
          prevState => {
              return {
                  data: []
              }
          }
      )
    }

    componentDidMount() {
        if (typeof this.props.onRequestFinished !== 'undefined') {
            this.props.onRequestFinished.addListener(this.handleRequest.bind(this));
        }
    }


    resetSelection() {
        this.setState(() => {
            return {
                selectedIndex: -1
            }
        });
    }

    handleRequest(har) {
        const queries = HarUtils.getGraphQLQueries(har);
        
        if (queries === []) {
          return;
        }

        const items = [];

        queries.forEach((query, pos) => {
            const getContent = har.getContent;
            const newHar = JSON.parse(JSON.stringify(har))
            newHar.getContent = getContent;
            newHar.request.postData.text = query;
            newHar.operationIndex = pos;

            const item = {
                har: newHar,
                operation: query.operation,
                url: har.request.url,
                status: har.response.status,
                size: har.response.content.size,
                time: har.time,
            }

            items.push(item);
        });

        this.setState(
            prevState => {
                return {
                    data: [...prevState.data, ...items]
                }
            }
        )
    }

    render() {
        const {data} = this.state;
        const columns = [
            {
                Header: () => (
                  <span>
                    <FaBan onClick={this.clearTable.bind(this)}/>  &nbsp;&nbsp; URL
                  </span>
                ),
                accessor: 'url'
            },
            {
                Header: 'Operation',
                accessor: 'operation'
            },
            {
                Header: 'Status',
                accessor: 'status',
                maxWidth: 100,
            },
            {
                Header: 'Size',
                accessor: 'size',
                maxWidth: 100,
                Cell: props => <span>{formatBytes(props.value)}</span>
            },
            {
                Header: 'Time',
                accessor: 'time',
                maxWidth: 100,
                Cell: props => <span>{Math.round(props.value)}&nbsp;ms</span>
            }
        ];

        return <ReactTable
            className="-striped -highlight"
            showPagination={false}
            sortable={true}
            data={data}
            columns={columns}
            minRows={0}
            getTrProps={(state, rowInfo, column) => {
                let style = {};
                if (rowInfo.index === this.state.selectedIndex) {
                    Object.assign(style, {background: '#ddeeff'});
                }
                if (rowInfo.row.status >= 400) {
                    Object.assign(style, {color: 'red'});
                }

                return style ? {style: style} : {};
            }}
            getTdProps={(state, rowInfo, column, instance) => {
                return {
                    onClick: (e, handleOriginal) => {
                        this.setState(() => {
                            return {
                                selectedIndex: rowInfo.index
                            }
                        });
                        if (this.props.onClick) {
                            this.props.onClick(state.data[rowInfo.index].har);
                        }
                        if (handleOriginal) {
                            handleOriginal()
                        }
                    }
                }
            }}
        />
    }
}
