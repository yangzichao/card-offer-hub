@citi @browser @recovery
Feature: Isolate unresolved Citi offers and continue the rest
  Unknown outcomes must never auto-retry or prevent unrelated offers from adding.
  Transport failures and rate limits still stop the batch.

  Background:
    Given a synthetic Citi page with the published userscript
    And I loaded offers and selected only card A

  Scenario: One unconfirmed offer does not stop the next offer
    Given only the first Citi enrollment will be unconfirmed
    When I click "Add saved offers"
    And the operation reports "Finished: 1/2"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-a | a     |
      | card-a | b     |
    And the disabled-action explanation contains "1 saved offer(s) need a status check"
    When I reload the page
    And one minute passes without a click
    Then no new Citi requests have been sent
    And no enrollment request was repeated
    And the disabled-action explanation contains "1 saved offer(s) need a status check"

  Scenario: One unresolved offer leaves the remaining 225 usable after Stop and reload
    Given Citi has 226 available offers
    And only the first Citi enrollment will be unconfirmed
    And I will press Stop while the first enrollment is in flight
    When I click "Refresh & add offers"
    And the operation reports "Stopped"
    Then the saved-offers button shows 225 available offers
    And the "Add saved offers" button is enabled
    When I reload the page
    Then the "Add saved offers" button is enabled
    And the disabled-action explanation contains "1 saved offer(s) need a status check"
    When I click "Add saved offers"
    And the operation reports "Finished: 225/225"
    Then exactly 226 enrollment request has been sent
    And no enrollment request was repeated

  Scenario: Explicit refresh resolves an unknown success without replaying it
    Given only the first Citi enrollment will be unconfirmed
    When I click "Add saved offers"
    And the operation reports "Finished: 1/2"
    Given Citi confirms that offer "a" on card A is already enrolled
    When I click "Refresh & add offers"
    And the operation reports "Up to date"
    Then the enrollment requests are exactly
      | card   | offer |
      | card-a | a     |
      | card-a | b     |

  Scenario: A rate limit disables both actions and never retries by itself
    Given Citi will rate limit enrollment requests
    When I click "Add saved offers"
    And the operation reports "HTTP 429"
    Then the "Add saved offers" button is disabled
    And the "Refresh & add offers" button is disabled
    And the disabled-action explanation contains "cooldown"
    When I reload the page
    And one minute passes without a click
    Then no new Citi requests have been sent
    And the "Add saved offers" button is disabled
    And the "Refresh & add offers" button is disabled
    And exactly 1 enrollment request has been sent
