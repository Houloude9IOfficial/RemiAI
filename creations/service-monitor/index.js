import inquirer from 'inquirer';
import checkService from './checker.js';
import services from './services.js';
import chalk from 'chalk';
import fs from 'fs';

// Log results to a file
function logResult(service, result) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${service.name}: ${result.isUp ? 'UP' : 'DOWN'} (${result.responseTime}ms)`;
  fs.appendFileSync('results.log', logEntry + '\n');
}

async function main() {
  const { service } = await inquirer.prompt([
    {
      type: 'list',
      name: 'service',
      message: 'Select a service to check:',
      choices: [...services.map(s => s.name), 'Check All', 'Exit']
    }
  ]);

  if (service === 'Exit') {
    console.log(chalk.yellow('Exiting...'));
    process.exit(0);
  }

  if (service === 'Check All') {
    console.log(chalk.blue('Checking all services...\n'));
    for (const s of services) {
      const result = await checkService(s.url);
      console.log(chalk.bold(`Service: ${s.name}`));
      console.log(`  ${result.isUp ? chalk.green('Status: UP') : chalk.red('Status: DOWN')}`);
      console.log(`  Response Time: ${result.responseTime}ms`);
      if (result.status) console.log(`  HTTP Status: ${result.status}`);
      if (result.error) console.log(`  ${chalk.yellow('Error:')} ${result.error}`);
      console.log('');
      logResult(s, result);
    }
  } else {
    const selectedService = services.find(s => s.name === service);
    console.log(chalk.blue(`Checking ${selectedService.name}...\n`));
    const result = await checkService(selectedService.url);
    console.log(chalk.bold(`Service: ${selectedService.name}`));
    console.log(`  ${result.isUp ? chalk.green('Status: UP') : chalk.red('Status: DOWN')}`);
    console.log(`  Response Time: ${result.responseTime}ms`);
    if (result.status) console.log(`  HTTP Status: ${result.status}`);
    if (result.error) console.log(`  ${chalk.yellow('Error:')} ${result.error}`);
    logResult(selectedService, result);
  }

  const { again } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'again',
      message: 'Do you want to check another service?',
      default: true
    }
  ]);

  if (again) {
    await main();
  } else {
    console.log(chalk.yellow('Exiting...'));
    process.exit(0);
  }
}

main().catch(console.error);