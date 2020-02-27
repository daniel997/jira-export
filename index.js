const moment = require('moment');
const request = require('request');
require('dotenv').config();


const login = `${process.env.JIRA_USER}:${process.env.JIRA_PASSWORD}`;
let armoredAuth = new Buffer.from(login).toString('base64');

const loadWorklogData = (worklog) => {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            url: worklog.path,
            headers: {
                'Authorization': `Basic ${armoredAuth}`,
                'Content-Type': 'application/json',
            },
        };
        request(requestOptions, (error, response, body) => {
            const worklogs = JSON.parse(body).worklogs.filter(log => log.author.name === process.env.JIRA_USER.toLowerCase());

            resolve({
                data: worklogs,
                key: worklog.key,
            });
        });
    });
};

const loadAllWorklogs = () => {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            url: `${process.env.JIRA_PATH}/rest/api/latest/search?jql=worklogAuthor=currentUser()%20AND%20worklogDate>=startOfMonth()`,
            headers: {
                'Authorization': `Basic ${armoredAuth}`,
                'Content-Type': 'application/json',
            }
        };

        request(requestOptions, (error, response, body) => {
           const { issues } = JSON.parse(body);

           const requests = issues
               .map((issue) => ({
                   path: issue.self + '/worklog',
                   key: issue.key,
               }))
               .map((worklog) => loadWorklogData(worklog));

           Promise.all(requests)
               .then(d => {
                   const results = d
                       .map(r => (r.data.map(i => ({
                               key: r.key,
                               worklogComment: i.comment,
                               started: i.started,
                               worklogStarted: moment(i.started).format('DD.MM.YYYY'),
                               worklogSpent: i.timeSpentSeconds/(60 * 60),
                           }))
                       ))
                       .flat()
                       .sort(function(a, b) {
                           a = new Date(a.started);
                           b = new Date(b.started);
                           return a < b ? -1 : a > b ? 1 : 0;
                       });

                   const reduced = results.reduce((acc, curr) => {
                       const index = Object.keys(acc).indexOf(curr.worklogStarted);
                       if (index === -1) {
                           acc[curr.worklogStarted] = {
                               worklogs: [curr],
                               totalSpent: curr.worklogSpent,
                               keys: `${curr.key}, `,
                               date: curr.worklogStarted,
                           };
                       } else {
                           acc[curr.worklogStarted].worklogs.push(curr);
                           acc[curr.worklogStarted].totalSpent += curr.worklogSpent;
                           if (!acc[curr.worklogStarted].keys.includes(curr.key)) {
                               acc[curr.worklogStarted].keys += `${curr.key}, `;
                           }
                       }

                       return acc;
                   }, []);

                   console.log('================================================= SUMMARY ==============================================');
                   let total = 0;
                   Object.keys(reduced).forEach(rowIndex => {
                       total += reduced[rowIndex].totalSpent;
                   });

                   console.log(`TOTAL: ${total}h`);
                   console.log(`SPs: ${total/16}`);

                   console.log('\n');
                   console.log('================================================ FORMATTED ===============================================');
                   Object.keys(reduced).forEach(rowIndex => {
                       const row = reduced[rowIndex];
                       console.log(`${row.date}     ${row.totalSpent}h     ${row.keys}`);
                   });

                   console.log('\n');
                   console.log('================================================= RAW ================================================');
                   results.forEach(r => console.log(`${r.worklogStarted}     ${r.key}     ${r.worklogSpent}h      ${r.worklogComment ? r.worklogComment : ''}`));
               });
        });
    })
};

loadAllWorklogs();
