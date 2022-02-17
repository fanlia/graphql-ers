const http = require('http')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const multer = require('multer')
const debug = require('debug')
const Restrict = require('@ersinfotech/restrict')
const graphql = require('./graphql')
const MP = require('./middleware-promise')

module.exports = (config, options) => {
    process.env.NODE_ENV = process.env.NODE_ENV || 'development'
    const name = config.clientId || 'clientId'

    const logger = console

    process.on('uncaughtException', (err) => {
        logger.error(err)
        process.exit()
    })

    process.on('unhandledRejection', (err) => {
        logger.error(err)
    })

    const fileSize = options.uploadFileSize || 5 * 1024 * 1024 // 5mb
    const fileDest = options.uploadFileDest
    const limit = options.postBodySize || '50mb'
    const bodyParserConfig = options.bodyParserConfig || {}

    const error = (err, req, res, next) => {
        res.status(500)
        process.env.NODE_ENV === 'production'
            ? res.send({ error: err.message })
            : res.send({ error: err.message, stack: err.stack })
    }

    const app = express()
    app.enable('trust proxy')

    app
        .use(cors())
        .use(bodyParser.json({ limit, ...bodyParserConfig.json }))
        .use(
            bodyParser.urlencoded({
                limit,
                extended: true,
                ...bodyParserConfig.urlencoded,
            })
        )
        .use(bodyParser.text({ limit, type: 'text/*', ...bodyParserConfig.text }))
        .use(
            multer({
                limits: { fileSize },
                dest: fileDest,
                ...bodyParserConfig.multer,
            }).any()
        )

    const restrict = options.restrict || Restrict(config.eadmin)

    if (options.restful) {
        global.MP = MP
        const rapi = require('express').Router()
        options.restful(logger, rapi, restrict)
        app.use('/', rapi)
    }

    if (options.graphql) {
        const gapi = require('express').Router()
        const goptions = options.graphql(logger, gapi)
        graphql(gapi, config, goptions, restrict)
        app.use('/graphql', gapi)
    }

    if (options.public) {
        app.use('/public', express.static(options.public))
    }

    if (options.app) {
        options.app(logger, server, restrict)
    }

    app.use(error)

    const server = http.Server(app)

    if (options.server) {
        options.server(logger, server, restrict)
    }

    const port = (config.http && config.http.port) || process.env.PORT || 3000
    const version = process.version

    server.listen(port, () => {
        logger.log('\x1b[36m%s\x1b[0m', `[${version}] [${name}] http service is listening on port ${port} in ${process.env.NODE_ENV} mode`)
    })
}
