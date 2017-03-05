const nodeEnv = process.env.NODE_ENV || 'worker_development'
const dbConfig = require('../knexfile')[nodeEnv]
const knex = require('knex')(dbConfig)

const _ = require('lodash')
const request = require('request')
const handlebars = require('handlebars')
const util = require('../util')

// Scheduler Functions
// -------------------

var tick = function() {
  // Pull the subscribers from the database
  knex.from('queries')
    .innerJoin('subscribers', 'queries.query_id', 'subscribers.query_id')
    .innerJoin('services', 'queries.service_id', 'services.service_id')
    .then(function(rows) {
      var queries = _.groupBy(rows, function(q) {
          return q.query;
      })
      scheduleRequests(queries)
    })
}

var scheduleRequests = function(queries) {
  let query, data, emails, subscribers

  for (query in queries) {
    subscribers = queries[query];
    emails = subscribers.map(query => query.email)
    queueRequest({
      query,
      emails,
      endpoint: subscribers[0].endpoint,
      template: subscribers[0].template,
    })
  }

}

var queueRequest = function(subscription) {
  // Queue the desired request. In the future, this may use SQS, RabbitMQ, or
  // some other full-featured queue. For now, just schedule in the current
  // thread.
  setTimeout(() => { consumeRequest(subscription) }, 0)
}

// Consumer Functions
// ------------------

var consumeRequest = function(subscription) {
  let url = subscription.endpoint + '?' + subscription.query
  request(url, function(error, response, body) {
    if (error || response.statusCode !== 200) {
      console.log('error!')
      return;
    }
    sendEmail(subscription, body)
  })
}

var sendEmail = function(subscription, body) {
  var template = handlebars.compile(subscription.template)
  var result = template({response: JSON.parse(body)})
  let transporter = util.getEmailTransporter(process.env.DEBUG);
  for (let email of subscription.emails) {
    console.log(process.env.DEFAULT_FROM_EMAIL)
    transporter.sendMail({
      from: process.env.DEFAULT_FROM_EMAIL,
      to: [email],
      subject: 'Your crime data',
      html: result
    }, (err, info) => {
      console.log(err)
      if (info && info.message) { console.log(info.message.toString()) }
    });
  }
}

tick();
