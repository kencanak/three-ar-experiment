# three-ar-experiment

## Preview
[![Alt text](https://img.youtube.com/vi/iJ_7b5HpLp4/0.jpg)](https://www.youtube.com/watch?v=iJ_7b5HpLp4)

## Demo link
https://three-ar-experiment.herokuapp.com/

## Pre-requisites
### Development
1. Git
2. Node.js and npm Node ^8.4.0, npm ^5.3.0
3. Bower (npm install -g bower)
4. Gulp CLI ^3.9.0


### Viewing
1. Follow the instructions on how to install `WebARonARCore` or `WebARonARKit` into your device
  - https://developers.google.com/ar/develop/web/getting-started


## Running the app
1. Go to project root
2. run `gulp serve`
3. open `WebARonARCore` app, go to `http://localhost:9000`


## Project build
1. Go to project root
2. run `npm install` and `bower install`
2. run `gulp build`
3. All distribution files will be generated into `dist/public` folder


## Deploying to heroku
1. create `free` heroku account
2. install `Heroku Toolbelt` - https://github.com/heroku/legacy-cli
3. create new heroku app by `heroku create [app name]`
4. you will see the following message once the app created
  `Creating ⬢ three-ar-experiment... done`
  `[app-url] | [heroku app repo]`
5. you should see `heroku` as one of the remote repo when you run `git remote`
6. build the project accordingly, please refer to the above instructions
7. once you are done with it, commit and push the `dist folder` to heroku master branch
  `git subtree push --prefix dist/ heroku master`
8. once done, you can now preview the app from `[heroku app url]`


## TODO
1. [ ] ~~add in trajectory line~~
2. [x] add in swipe to throw thingy
3. [ ] improve user experience
4. [x] proper game play add in score feat, need a score limit though
5. [ ] add in fancy environment, and user feedback, we need some *pennywise* here, you'll float too!
6. [x] add in gulp task for deploying to `gcloud` or `heroku`
