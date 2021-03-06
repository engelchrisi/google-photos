const http = require('http');
const config = require('./config.js');
const request = require('request-promise');

(function (photoApi) {
    var logger;

    photoApi.setLogger = function (logger0) {
        logger = logger0;
    }

    // Submits a search request to the Google Photos Library API for the given
    // parameters. The authToken is used to authenticate requests for the API.
    // The minimum number of expected results is configured in config.photosToLoad.
    // This function makes multiple calls to the API to load at least as many photos
    // as requested. This may result in more items being listed in the response than
    // originally requested.
    photoApi.libraryApiSearch = async function (authToken, parameters) {
        let photos = [];
        let nextPageToken = null;
        let error = null;

        parameters.pageSize = config.searchPageSize;

        try {
            // Loop while the number of photos threshold has not been met yet
            // and while there is a nextPageToken to load more items.
            do {
                logger.info(
                    `Submitting search with parameters: ${JSON.stringify(parameters)}`);

                // Make a POST request to search the library or album
                const result =
                    await request.post(config.apiEndpoint + '/v1/mediaItems:search', {
                        headers: { 'Content-Type': 'application/json' },
                        json: parameters,
                        auth: { 'bearer': authToken },
                    });

                logger.debug(`Response: ${result}`);

                // The list of media items returned may be sparse and contain missing
                // elements. Remove all invalid elements.
                // Also remove all elements that are not images by checking its mime type.
                // Media type filters can't be applied if an album is loaded, so an extra
                // filter step is required here to ensure that only images are returned.
                const items = result && result.mediaItems ?
                    result.mediaItems
                        .filter(x => x)  // Filter empty or invalid items.
                        // Only keep media items with an image mime type.
                        .filter(x => x.mimeType && x.mimeType.startsWith('image/')) :
                    [];

                photos = photos.concat(items);

                // Set the pageToken for the next request.
                parameters.pageToken = result.nextPageToken;

                logger.verbose(
                    `Found ${items.length} images in this request. Total images: ${
                    photos.length}`);

                // Loop until the required number of photos has been loaded or until there
                // are no more photos, ie. there is no pageToken.
            } while (photos.length < config.photosToLoad &&
                parameters.pageToken != null);

        } catch (err) {
            // If the error is a StatusCodeError, it contains an error.error object that
            // should be returned. It has a name, statuscode and message in the correct
            // format. Otherwise extract the properties.
            error = err.error.error ||
                { name: err.name, code: err.statusCode, message: err.message };
            logger.error(error);
        }

        logger.info('Search complete.');
        return { photos, parameters, error };
    }

    // Returns a list of all albums owner by the logged in user from the Library
    // API.
    photoApi.libraryApiGetAlbums = async function (authToken) {
        let albums = [];
        let nextPageToken = null;
        let error = null;
        let parameters = { pageSize: config.albumPageSize };

        try {
            // Loop while there is a nextpageToken property in the response until all
            // albums have been listed.
            do {
                logger.verbose(`Loading albums. Received so far: ${albums.length}`);
                // Make a GET request to load the albums with optional parameters (the
                // pageToken if set).
                const result = await request.get(config.apiEndpoint + '/v1/albums', {
                    headers: { 'Content-Type': 'application/json' },
                    qs: parameters,
                    json: true,
                    auth: { 'bearer': authToken },
                });

                logger.debug(`Response: ${result}`);

                if (result && result.albums) {
                    logger.verbose(`Number of albums received: ${result.albums.length}`);
                    // Parse albums and add them to the list, skipping empty entries.
                    const items = result.albums.filter(x => !!x);

                    albums = albums.concat(items);
                }
                parameters.pageToken = result.nextPageToken;
                // Loop until all albums have been listed and no new nextPageToken is
                // returned.
            } while (parameters.pageToken != null);

        } catch (err) {
            // If the error is a StatusCodeError, it contains an error.error object that
            // should be returned. It has a name, statuscode and message in the correct
            // format. Otherwise extract the properties.
            error = err.error.error ||
                { name: err.name, code: err.statusCode, message: err.message };
            logger.error(error);
        }

        logger.info('Albums loaded.');
        return { albums, error };
    }



}(module.exports));