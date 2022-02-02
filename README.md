# selenium-nft-api

Magic Eden scraper using selenium

1. Install Node
   https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-up-node-on-ec2-instance.html

2. Install Git
   https://cloudaffaire.com/how-to-install-git-in-aws-ec2-instance/

3. Install Selenium
   https://understandingdata.com/install-google-chrome-selenium-ec2-aws/

cd /tmp/
sudo wget https://chromedriver.storage.googleapis.com/80.0.3987.106/chromedriver_linux64.zip
sudo unzip chromedriver_linux64.zip
sudo mv chromedriver /usr/bin/chromedriver
chromedriver – version

also

sudo curl https://intoli.com/install-google-chrome.sh | bash
sudo mv /usr/bin/google-chrome-stable /usr/bin/google-chrome
google-chrome – version && which google-chrome

4. Install pm2

npm install pm2 -g

5. Clone Repo

git clone https://github.com/tlskins/selenium-nft-api

6. Install dependencies

cd selenium-nft-api/
npm install
